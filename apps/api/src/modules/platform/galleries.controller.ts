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
  Put,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuditService } from '../../common/audit.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { rethrowPrisma } from '../../common/http.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { PrismaService } from '../../common/prisma.service.js';
import { PublicSync } from '../../common/public-sync.service.js';
import { StorageService } from '../../common/storage.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf, defined, requireNonNull, publishStamp } from './actor.js';
import { CreateGalleryDto, GalleryItemsDto, IdsDto, UpdateGalleryDto } from './dto.js';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');

/** §16 — galleries: ordered selections from the media library. The public gallery reads these. */
@Controller('admin/galleries')
@UseGuards(AdminGuard)
@UseInterceptors(NoStoreInterceptor)
export class GalleriesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly sync: PublicSync,
  ) {}

  @Get()
  @RequirePermission('gallery.view')
  async list() {
    const developmentId = await this.dev.id();
    const rows = await this.prisma.client.gallery.findMany({
      where: { developmentId, archivedAt: null },
      orderBy: { sortOrder: 'asc' },
      include: {
        coverMedia: true,
        items: { orderBy: { sortOrder: 'asc' }, take: 4, include: { media: true } },
        _count: { select: { items: true } },
      },
    });
    return rows.map(({ coverMedia, items, _count, ...g }) => ({
      ...g,
      itemCount: _count.items,
      cover: coverMedia ? this.storage.present(coverMedia) : items[0] ? this.storage.present(items[0].media) : null,
      preview: items.map((i) => this.storage.present(i.media)),
    }));
  }

  @Get(':id')
  @RequirePermission('gallery.view')
  async get(@Param('id') id: string) {
    const g = await this.owned(id);
    const full = await this.prisma.client.gallery.findUniqueOrThrow({
      where: { id: g.id },
      include: { coverMedia: true, items: { orderBy: { sortOrder: 'asc' }, include: { media: true } } },
    });
    return {
      ...full,
      coverMedia: full.coverMedia ? this.storage.present(full.coverMedia) : null,
      items: full.items.map((i) => ({ ...this.storage.present(i.media), itemOrder: i.sortOrder })),
    };
  }

  @Post()
  @RequirePermission('gallery.edit')
  async create(@Body() dto: CreateGalleryDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    if (dto.coverMediaId) await this.assertMedia([dto.coverMediaId], developmentId);
    const max = await this.prisma.client.gallery.aggregate({ where: { developmentId }, _max: { sortOrder: true } });
    const g = await this.prisma.client.gallery
      .create({
        data: {
          developmentId,
          title: dto.title,
          slug: dto.slug ?? slugify(dto.title),
          description: dto.description ?? null,
          coverMediaId: dto.coverMediaId ?? null,
          ...publishStamp(actorOf(req), dto.published, true),
          sortOrder: (max._max.sortOrder ?? -1) + 1,
        },
      })
      .catch((e) => rethrowPrisma(e, { unique: 'A gallery with that name already exists.' }));
    await this.audit.record({ actorId: actorOf(req).id, action: 'gallery.create', entity: 'gallery', entityId: g.id, target: g.title, summary: `Created gallery ${g.title}`, req });
    await this.sync.changed('media');
    return g;
  }

  @Patch(':id')
  @RequirePermission('gallery.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateGalleryDto, @Req() req: AdminRequest) {
    requireNonNull(dto, ['title', 'slug', 'published']);
    const g = await this.owned(id);
    if (dto.coverMediaId) await this.assertMedia([dto.coverMediaId], g.developmentId);
    const after = await this.prisma.client.gallery
      .update({ where: { id }, data: { ...defined({ ...dto, published: undefined }), ...publishStamp(actorOf(req), dto.published) } })
      .catch((e) => rethrowPrisma(e, { unique: 'Another gallery already uses that slug.' }));
    await this.audit.record({ actorId: actorOf(req).id, action: 'gallery.update', entity: 'gallery', entityId: id, target: after.title, summary: `Updated gallery ${after.title}`, req });
    await this.sync.changed('media');
    return after;
  }

  /** Replaces the gallery's contents with these files, in this order. */
  @Put(':id/items')
  @RequirePermission('gallery.edit')
  async items(@Param('id') id: string, @Body() dto: GalleryItemsDto, @Req() req: AdminRequest) {
    const g = await this.owned(id);
    const ids = [...new Set(dto.mediaIds)];
    await this.assertMedia(ids, g.developmentId);
    await this.prisma.client.$transaction([
      this.prisma.client.galleryItem.deleteMany({ where: { galleryId: id } }),
      this.prisma.client.galleryItem.createMany({ data: ids.map((mediaId, i) => ({ galleryId: id, mediaId, sortOrder: i })) }),
    ]);
    await this.audit.record({ actorId: actorOf(req).id, action: 'gallery.items', entity: 'gallery', entityId: id, target: g.title, summary: `${g.title}: ${ids.length} items`, rowCount: ids.length, req });
    await this.sync.changed('media');
    return this.get(id);
  }

  @Post('reorder')
  @HttpCode(200)
  @RequirePermission('gallery.edit')
  async reorder(@Body() dto: IdsDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    await this.prisma.client.$transaction(dto.ids.map((id, i) => this.prisma.client.gallery.updateMany({ where: { id, developmentId }, data: { sortOrder: i } })));
    await this.audit.record({ actorId: actorOf(req).id, action: 'gallery.reorder', entity: 'gallery', summary: `Reordered ${dto.ids.length} galleries`, rowCount: dto.ids.length, req });
    await this.sync.changed('media');
    return { ok: true };
  }

  @Delete(':id')
  @RequirePermission('gallery.edit')
  async remove(@Param('id') id: string, @Req() req: AdminRequest) {
    const g = await this.owned(id);
    // The files stay in the library; only the selection goes.
    await this.prisma.client.gallery.delete({ where: { id } });
    await this.audit.record({ actorId: actorOf(req).id, action: 'gallery.delete', entity: 'gallery', entityId: id, target: g.title, summary: `Deleted gallery ${g.title}`, req });
    await this.sync.changed('media');
    return { ok: true };
  }

  private async assertMedia(ids: string[], developmentId: string) {
    const n = await this.prisma.client.media.count({ where: { id: { in: ids }, developmentId } });
    if (n !== ids.length) throw new BadRequestException('Some files do not belong to this property.');
  }

  private async owned(id: string) {
    const developmentId = await this.dev.id();
    const g = await this.prisma.client.gallery.findFirst({ where: { id, developmentId } });
    if (!g) throw new NotFoundException('No such gallery');
    return g;
  }
}
