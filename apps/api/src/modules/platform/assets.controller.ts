import type {} from '@fastify/multipart';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Prisma } from '@avida/db';
import { categoriesFor, MEDIA_COLLECTIONS, type MediaCollectionValue } from '@avida/types';
import { AuditService } from '../../common/audit.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { boolOrUndefined, pageOf, paged } from '../../common/http.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { PrismaService } from '../../common/prisma.service.js';
import { PublicSync } from '../../common/public-sync.service.js';
import { StorageService, type StoredFile } from '../../common/storage.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf } from './actor.js';
import { BulkAssetDto, IdsDto, UpdateAssetDto } from './dto.js';

type Owner = { unitId?: string | null; floorId?: string | null; amenityId?: string | null; roomId?: string | null; typologyId?: string | null };
const OWNER_KEYS = ['unitId', 'floorId', 'amenityId', 'roomId', 'typologyId'] as const;

const ownerInclude = {
  unit: { select: { id: true, code: true } },
  floor: { select: { id: true, label: true } },
  amenity: { select: { id: true, name: true } },
  room: { select: { id: true, name: true, unit: { select: { code: true } } } },
  typology: { select: { id: true, name: true } },
  _count: { select: { galleryItems: true } },
} satisfies Prisma.MediaInclude;

/**
 * §15–§18 — the media library: photographs, renders, videos, floor plans and
 * architectural drawings, in one table. A file belongs to one owner (a
 * residence, floor, amenity, room or residence type) or, with none, to the
 * project. Uploads go through StorageService, which validates and renders.
 */
@Controller('admin/assets')
@UseGuards(AdminGuard)
@UseInterceptors(NoStoreInterceptor)
export class AssetsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly sync: PublicSync,
  ) {}

  @Get()
  async list(@Query() q: Record<string, string | undefined>) {
    const developmentId = await this.dev.id();
    const p = pageOf(q.page, q.pageSize ?? '60', 500);
    const where: Prisma.MediaWhereInput = {
      developmentId,
      ...(q.collection ? { collection: q.collection as Prisma.MediaWhereInput['collection'] } : {}),
      ...(q.kind ? { kind: { in: q.kind.split(',') as NonNullable<Prisma.MediaWhereInput['kind']>[] as never } } : {}),
      ...(q.category ? { category: q.category } : {}),
      ...(q.unitId ? { unitId: q.unitId } : {}),
      ...(q.floorId ? { floorId: q.floorId } : {}),
      ...(q.amenityId ? { amenityId: q.amenityId } : {}),
      ...(q.roomId ? { roomId: q.roomId } : {}),
      ...(q.typologyId ? { typologyId: q.typologyId } : {}),
      ...(q.scope === 'project' ? { unitId: null, floorId: null, amenityId: null, roomId: null, typologyId: null } : {}),
      ...(boolOrUndefined(q.published) !== undefined ? { published: boolOrUndefined(q.published) } : {}),
      ...(q.q
        ? {
            OR: [
              { title: { contains: q.q, mode: 'insensitive' } },
              { caption: { contains: q.q, mode: 'insensitive' } },
              { altText: { contains: q.q, mode: 'insensitive' } },
              { unit: { code: { contains: q.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const order: Prisma.MediaOrderByWithRelationInput[] = q.sort === 'order' ? [{ sortOrder: 'asc' }, { createdAt: 'desc' }] : [{ createdAt: 'desc' }];
    const [rows, total, byCategory] = await Promise.all([
      this.prisma.client.media.findMany({ where, include: ownerInclude, orderBy: order, skip: p.skip, take: p.take }),
      this.prisma.client.media.count({ where }),
      this.prisma.client.media.groupBy({ by: ['category'], where: { developmentId, ...(q.collection ? { collection: q.collection as never } : {}) }, _count: true }),
    ]);
    return {
      ...paged(rows.map((m) => this.view(m)), total, p),
      categories: Object.fromEntries(byCategory.map((c) => [c.category, c._count])),
    };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const m = await this.owned(id);
    const galleries = await this.prisma.client.galleryItem.findMany({ where: { mediaId: id }, include: { gallery: { select: { id: true, title: true } } } });
    return { ...this.view(m), galleries: galleries.map((g) => g.gallery) };
  }

  /**
   * Multipart upload of one or more files. Text fields that arrive before the
   * files set their collection, category and owner; every file in the request
   * gets the same.
   */
  @Post('upload')
  @RequirePermission('media.edit')
  async upload(@Req() req: AdminRequest) {
    if (!req.isMultipart()) throw new BadRequestException('Send the files as multipart/form-data.');
    const developmentId = await this.dev.id();
    const actor = actorOf(req);
    const fields: Record<string, string> = {};
    const stored: { file: StoredFile; name: string }[] = [];

    try {
      for await (const part of req.parts()) {
        if (part.type === 'field') {
          fields[part.fieldname] = String(part.value ?? '');
          continue;
        }
        const buffer = await part.toBuffer();
        stored.push({ file: await this.storage.store(buffer, part.mimetype), name: part.filename });
      }
    } catch (error) {
      // Anything stored before the failure is removed, so a half-finished
      // upload leaves no orphan files.
      await this.storage.remove(stored.flatMap((s) => this.storage.keysOf(s.file)));
      if ((error as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') throw new BadRequestException('That file is too large.');
      throw error;
    }
    if (stored.length === 0) throw new BadRequestException('Choose at least one file.');

    const collection = (fields.collection || 'LIBRARY') as MediaCollectionValue;
    if (!MEDIA_COLLECTIONS.includes(collection)) throw new BadRequestException('Unknown collection.');
    const category = fields.category || (collection === 'FLOOR_PLAN' ? 'RESIDENCE_PLAN' : 'OTHER');
    if (!categoriesFor(collection).includes(category)) throw new BadRequestException(`“${category}” is not a category of ${collection.toLowerCase()}.`);
    const owner: Owner = Object.fromEntries(OWNER_KEYS.map((k) => [k, fields[k] || null]));
    await this.assertOwner(owner, developmentId);

    const scope = this.ownerWhere(owner);
    const [max, hasCover] = await Promise.all([
      this.prisma.client.media.aggregate({ where: { developmentId, ...scope }, _max: { sortOrder: true } }),
      this.prisma.client.media.count({ where: { developmentId, ...scope, isCover: true } }),
    ]);
    const anyOwner = OWNER_KEYS.some((k) => owner[k]);
    let order = (max._max.sortOrder ?? -1) + 1;

    const created = await this.prisma.client.$transaction(
      stored.map(({ file, name }, i) =>
        this.prisma.client.media.create({
          data: {
            developmentId,
            kind: file.kind,
            collection,
            category,
            title: fields.title || name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 200),
            altText: fields.altText || null,
            caption: fields.caption || null,
            storageKey: file.storageKey,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
            width: file.width,
            height: file.height,
            variants: file.variants ?? undefined,
            blurDataUrl: file.blurDataUrl,
            dominantHex: file.dominantHex,
            published: fields.published !== 'false',
            // The first image a residence, floor or amenity receives becomes its cover.
            isCover: anyOwner && collection === 'LIBRARY' && file.kind === 'IMAGE' && hasCover === 0 && i === 0,
            sortOrder: order++,
            uploadedById: actor.id,
            ...owner,
          },
          include: ownerInclude,
        }),
      ),
    );

    if (fields.galleryId) {
      const gallery = await this.prisma.client.gallery.findFirst({ where: { id: fields.galleryId, developmentId } });
      if (gallery) {
        const gmax = await this.prisma.client.galleryItem.aggregate({ where: { galleryId: gallery.id }, _max: { sortOrder: true } });
        let g = (gmax._max.sortOrder ?? -1) + 1;
        await this.prisma.client.galleryItem.createMany({ data: created.map((m) => ({ galleryId: gallery.id, mediaId: m.id, sortOrder: g++ })) });
      }
    }

    const where = created[0] ? this.ownerLabel(created[0]) : 'the project';
    await this.audit.record({
      actorId: actor.id,
      action: 'media.upload',
      entity: owner.unitId ? 'residence' : 'media',
      entityId: owner.unitId ?? created[0]?.id,
      target: where,
      summary: `Uploaded ${created.length} ${collection === 'FLOOR_PLAN' ? 'floor plan' : collection === 'DESIGN' ? 'design file' : 'file'}${created.length === 1 ? '' : 's'} to ${where}`,
      rowCount: created.length,
      req,
    });
    await this.sync.changed('media');
    return created.map((m) => this.view(m));
  }

  /** §17 — replace the file, keep the record, its captions and every place it is used. */
  @Post(':id/replace')
  @RequirePermission('media.edit')
  async replace(@Param('id') id: string, @Req() req: AdminRequest) {
    const before = await this.owned(id);
    if (!req.isMultipart()) throw new BadRequestException('Send the file as multipart/form-data.');
    const part = await req.file();
    if (!part) throw new BadRequestException('Choose a file.');
    const file = await this.storage.store(await part.toBuffer(), part.mimetype);
    if (file.kind !== before.kind) {
      await this.storage.remove(this.storage.keysOf(file));
      throw new BadRequestException(`Replace a ${before.kind.toLowerCase()} with another ${before.kind.toLowerCase()}.`);
    }
    const after = await this.prisma.client.media.update({
      where: { id },
      data: {
        storageKey: file.storageKey,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        width: file.width,
        height: file.height,
        variants: file.variants ?? undefined,
        blurDataUrl: file.blurDataUrl,
        dominantHex: file.dominantHex,
      },
      include: ownerInclude,
    });
    await this.storage.remove(this.storage.keysOf(before));
    await this.audit.record({ actorId: actorOf(req).id, action: 'media.replace', entity: before.unitId ? 'residence' : 'media', entityId: before.unitId ?? id, target: this.ownerLabel(after), summary: `Replaced “${after.title ?? 'file'}” on ${this.ownerLabel(after)}`, req });
    await this.sync.changed('media');
    return this.view(after);
  }

  @Patch(':id')
  @RequirePermission('media.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateAssetDto, @Req() req: AdminRequest) {
    const before = await this.owned(id);
    const developmentId = before.developmentId;
    const collection = (dto.collection ?? before.collection) as MediaCollectionValue;
    if (dto.category !== undefined || dto.collection !== undefined) {
      const category = dto.category ?? before.category;
      if (!categoriesFor(collection).includes(category)) throw new BadRequestException(`“${category}” is not a category of ${collection.toLowerCase()}.`);
    }
    const ownerChange = OWNER_KEYS.some((k) => dto[k] !== undefined);
    const owner: Owner = Object.fromEntries(OWNER_KEYS.map((k) => [k, dto[k] !== undefined ? dto[k] : before[k]]));
    if (ownerChange) await this.assertOwner(owner, developmentId);

    const after = await this.prisma.client.$transaction(async (tx) => {
      if (dto.isCover) {
        await tx.media.updateMany({ where: { developmentId, ...this.ownerWhere(owner), id: { not: id } }, data: { isCover: false } });
      }
      return tx.media.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.caption !== undefined ? { caption: dto.caption } : {}),
          ...(dto.altText !== undefined ? { altText: dto.altText } : {}),
          ...(dto.collection !== undefined ? { collection: dto.collection as Prisma.MediaUpdateInput['collection'] } : {}),
          ...(dto.category !== undefined ? { category: dto.category } : {}),
          ...(dto.published !== undefined ? { published: dto.published } : {}),
          ...(dto.isCover !== undefined ? { isCover: dto.isCover } : {}),
          ...(ownerChange ? { ...owner, isCover: dto.isCover ?? false } : {}),
        },
        include: ownerInclude,
      });
    });
    await this.audit.record({
      actorId: actorOf(req).id,
      action: dto.isCover ? 'media.cover' : 'media.update',
      entity: after.unitId ? 'residence' : 'media',
      entityId: after.unitId ?? id,
      target: this.ownerLabel(after),
      summary: dto.isCover ? `Set “${after.title ?? 'image'}” as the cover of ${this.ownerLabel(after)}` : `Updated “${after.title ?? 'file'}”`,
      req,
    });
    await this.sync.changed('media');
    return this.view(after);
  }

  @Post('reorder')
  @HttpCode(200)
  @RequirePermission('media.edit')
  async reorder(@Body() dto: IdsDto) {
    const developmentId = await this.dev.id();
    await this.prisma.client.$transaction(dto.ids.map((id, i) => this.prisma.client.media.updateMany({ where: { id, developmentId }, data: { sortOrder: i } })));
    await this.sync.changed('media');
    return { ok: true };
  }

  @Post('bulk')
  @HttpCode(200)
  @RequirePermission('media.edit')
  async bulk(@Body() dto: BulkAssetDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const rows = await this.prisma.client.media.findMany({ where: { id: { in: dto.ids }, developmentId } });
    if (rows.length !== dto.ids.length) throw new NotFoundException('Some files were not found.');
    const ids = rows.map((r) => r.id);
    switch (dto.action) {
      case 'publish':
      case 'unpublish':
        await this.prisma.client.media.updateMany({ where: { id: { in: ids } }, data: { published: dto.action === 'publish' } });
        break;
      case 'category': {
        if (!dto.category) throw new BadRequestException('Choose a category.');
        const wrong = rows.find((r) => !categoriesFor(r.collection as MediaCollectionValue).includes(dto.category!));
        if (wrong) throw new BadRequestException(`“${dto.category}” does not apply to ${wrong.title ?? 'one of the files'}.`);
        await this.prisma.client.media.updateMany({ where: { id: { in: ids } }, data: { category: dto.category } });
        break;
      }
      case 'assign': {
        const owner: Owner = Object.fromEntries(OWNER_KEYS.map((k) => [k, dto[k] ?? null]));
        await this.assertOwner(owner, developmentId);
        await this.prisma.client.media.updateMany({ where: { id: { in: ids } }, data: { ...owner, isCover: false } });
        break;
      }
      case 'delete':
        await this.prisma.client.media.deleteMany({ where: { id: { in: ids } } });
        await this.storage.remove(rows.flatMap((r) => this.storage.keysOf(r)));
        break;
    }
    await this.audit.record({ actorId: actorOf(req).id, action: `media.bulk-${dto.action}`, entity: 'media', summary: `${dto.action[0]!.toUpperCase()}${dto.action.slice(1)} ${rows.length} files`, rowCount: rows.length, req });
    await this.sync.changed('media');
    return { changed: rows.length };
  }

  @Delete(':id')
  @RequirePermission('media.edit')
  async remove(@Param('id') id: string, @Req() req: AdminRequest) {
    const m = await this.owned(id);
    await this.prisma.client.media.delete({ where: { id } });
    await this.storage.remove(this.storage.keysOf(m));
    await this.audit.record({ actorId: actorOf(req).id, action: 'media.delete', entity: m.unitId ? 'residence' : 'media', entityId: m.unitId ?? id, target: this.ownerLabel(m), summary: `Deleted “${m.title ?? 'file'}” from ${this.ownerLabel(m)}`, req });
    await this.sync.changed('media');
    return { ok: true };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private view(m: Prisma.MediaGetPayload<{ include: typeof ownerInclude }>) {
    return {
      ...this.storage.present(m),
      owner: {
        unit: m.unit,
        floor: m.floor,
        amenity: m.amenity,
        room: m.room ? { id: m.room.id, name: m.room.name, unitCode: m.room.unit.code } : null,
        typology: m.typology,
        label: this.ownerLabel(m),
      },
      galleryCount: m._count.galleryItems,
    };
  }

  private ownerLabel(m: { unit?: { code: string } | null; floor?: { label: string } | null; amenity?: { name: string } | null; room?: { name: string; unit: { code: string } } | null; typology?: { name: string } | null }): string {
    if (m.room) return `${m.room.unit.code} · ${m.room.name}`;
    if (m.unit) return `Residence ${m.unit.code}`;
    if (m.floor) return m.floor.label;
    if (m.amenity) return m.amenity.name;
    if (m.typology) return m.typology.name;
    return 'the project';
  }

  private ownerWhere(owner: Owner): Prisma.MediaWhereInput {
    return Object.fromEntries(OWNER_KEYS.map((k) => [k, owner[k] ?? null]));
  }

  /** §31 — a file is attached only to records of this property; a room implies its residence. */
  private async assertOwner(owner: Owner, developmentId: string) {
    const set = OWNER_KEYS.filter((k) => owner[k]);
    if (set.length > 1 && !(set.length === 2 && owner.roomId && owner.unitId)) {
      throw new BadRequestException('Attach a file to one thing: a residence, a floor, an amenity, a room or a type.');
    }
    const checks: Promise<number>[] = [];
    if (owner.unitId) checks.push(this.prisma.client.unit.count({ where: { id: owner.unitId, developmentId } }));
    if (owner.floorId) checks.push(this.prisma.client.floor.count({ where: { id: owner.floorId, building: { developmentId } } }));
    if (owner.amenityId) checks.push(this.prisma.client.amenity.count({ where: { id: owner.amenityId, developmentId } }));
    if (owner.typologyId) checks.push(this.prisma.client.typology.count({ where: { id: owner.typologyId, developmentId } }));
    if (owner.roomId) {
      const room = await this.prisma.client.room.findFirst({ where: { id: owner.roomId, unit: { developmentId } }, select: { unitId: true } });
      if (!room) throw new BadRequestException('That room does not belong to this property.');
      owner.unitId = room.unitId;
    }
    const results = await Promise.all(checks);
    if (results.some((n) => n === 0)) throw new BadRequestException('That record does not belong to this property.');
  }

  private async owned(id: string) {
    const developmentId = await this.dev.id();
    const m = await this.prisma.client.media.findFirst({ where: { id, developmentId }, include: ownerInclude });
    if (!m) throw new NotFoundException('No such file');
    return m;
  }
}
