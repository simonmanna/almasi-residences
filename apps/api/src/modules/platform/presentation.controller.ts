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
import { MEDIA_SLOTS, SEO_ROUTES, SITE_TOURS, mediaSlotDef } from '@avida/types';
import { AuditService } from '../../common/audit.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { PrismaService } from '../../common/prisma.service.js';
import { PublicSync } from '../../common/public-sync.service.js';
import { RevalidateService } from '../../common/revalidate.service.js';
import { StorageService } from '../../common/storage.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf, defined, requireNonNull } from './actor.js';
import {
  CreateSceneDto,
  CreateSpecificationDto,
  IdsDto,
  UpdateFilmDto,
  UpdateSceneDto,
  UpdateSeoPageDto,
  UpdateSiteSeoDto,
  UpdateSlotDto,
  UpdateSpecificationDto,
  UpdateTourDto,
} from './dto.js';

/**
 * Roadmap phase 1 — everything the public site used to keep in its own
 * repository, managed here: which file fills each placement, the specification
 * table, the walkthroughs, the film and every route's metadata. Each write
 * refreshes the site through PublicSync, like any other admin change.
 */
@Controller('admin')
@UseGuards(AdminGuard)
@UseInterceptors(NoStoreInterceptor)
export class PresentationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly sync: PublicSync,
    private readonly revalidate: RevalidateService,
  ) {}

  /** A file chosen for the site must belong to this property and be the right kind. */
  private async media(id: string | null | undefined, developmentId: string, kind: 'IMAGE' | 'VIDEO', label: string) {
    if (!id) return null;
    const m = await this.prisma.client.media.findFirst({ where: { id, developmentId } });
    if (!m) throw new BadRequestException(`${label}: that file does not belong to this property.`);
    if (m.kind !== kind) throw new BadRequestException(`${label} must be ${kind === 'IMAGE' ? 'an image' : 'a video'}.`);
    return m;
  }

  // ─── Placements ────────────────────────────────────────────────────────

  @Get('slots')
  @RequirePermission('content.view')
  async slots() {
    const developmentId = await this.dev.id();
    const rows = await this.prisma.client.mediaSlot.findMany({ where: { developmentId }, include: { image: true, video: true } });
    const users = new Map((await this.prisma.client.adminUser.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    return MEDIA_SLOTS.map((def) => {
      const row = rows.find((r) => r.key === def.key);
      return {
        key: def.key,
        label: def.label,
        where: def.where,
        group: def.group,
        allowsVideo: def.video,
        image: row?.image ? this.storage.present(row.image) : null,
        video: row?.video ? this.storage.present(row.video) : null,
        updatedAt: row?.updatedAt ?? null,
        updatedBy: row?.updatedById ? (users.get(row.updatedById) ?? null) : null,
      };
    });
  }

  @Put('slots/:key')
  @RequirePermission('media.edit')
  async saveSlot(@Param('key') key: string, @Body() dto: UpdateSlotDto, @Req() req: AdminRequest) {
    const def = mediaSlotDef(key);
    if (!def) throw new NotFoundException('No such placement');
    if (dto.videoId && !def.video) throw new BadRequestException(`${def.label} shows a still image only.`);
    const developmentId = await this.dev.id();
    const image = await this.media(dto.imageId, developmentId, 'IMAGE', 'The image');
    const video = await this.media(dto.videoId, developmentId, 'VIDEO', 'The film');
    const data = defined({ imageId: dto.imageId === undefined ? undefined : (image?.id ?? null), videoId: dto.videoId === undefined ? undefined : (video?.id ?? null) });
    await this.prisma.client.mediaSlot.upsert({
      where: { developmentId_key: { developmentId, key } },
      create: { developmentId, key, imageId: image?.id ?? null, videoId: video?.id ?? null, updatedById: actorOf(req).id },
      update: { ...data, updatedById: actorOf(req).id },
    });
    await this.audit.record({
      actorId: actorOf(req).id,
      action: 'placement.update',
      entity: 'placement',
      entityId: key,
      target: def.label,
      summary: `${def.label}: ${[image ? `image “${image.title ?? 'untitled'}”` : dto.imageId === null ? 'image removed' : null, video ? `film “${video.title ?? 'untitled'}”` : dto.videoId === null ? 'film removed' : null].filter(Boolean).join(', ') || 'unchanged'}`,
      req,
    });
    await this.sync.changed('presentation');
    return (await this.slots()).find((s) => s.key === key);
  }

  // ─── Specification ─────────────────────────────────────────────────────

  @Get('specifications')
  @RequirePermission('typology.view')
  async specifications() {
    const developmentId = await this.dev.id();
    const [rows, types] = await Promise.all([
      this.prisma.client.specification.findMany({ where: { developmentId, archivedAt: null }, orderBy: [{ typologyId: 'asc' }, { sortOrder: 'asc' }] }),
      this.prisma.client.typology.findMany({ where: { developmentId }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
    ]);
    return { data: rows, types };
  }

  @Post('specifications')
  @RequirePermission('typology.edit')
  async createSpecification(@Body() dto: CreateSpecificationDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    await this.assertType(dto.typologyId, developmentId);
    const max = await this.prisma.client.specification.aggregate({ where: { developmentId, typologyId: dto.typologyId ?? null }, _max: { sortOrder: true } });
    const row = await this.prisma.client.specification.create({
      data: { developmentId, typologyId: dto.typologyId ?? null, category: dto.category ?? 'General', label: dto.label.trim(), value: dto.value.trim(), published: dto.published ?? true, sortOrder: (max._max.sortOrder ?? -1) + 1 },
    });
    await this.audit.record({ actorId: actorOf(req).id, action: 'specification.create', entity: 'specification', entityId: row.id, target: row.label, summary: `Added specification “${row.label}”`, after: { value: row.value }, req });
    await this.sync.changed('content');
    return row;
  }

  @Patch('specifications/:id')
  @RequirePermission('typology.edit')
  async updateSpecification(@Param('id') id: string, @Body() dto: UpdateSpecificationDto, @Req() req: AdminRequest) {
    requireNonNull(dto, ['label', 'value', 'category', 'published']);
    const developmentId = await this.dev.id();
    const before = await this.prisma.client.specification.findFirst({ where: { id, developmentId } });
    if (!before) throw new NotFoundException('No such specification');
    await this.assertType(dto.typologyId, developmentId);
    const row = await this.prisma.client.specification.update({ where: { id }, data: defined({ ...dto }) });
    await this.audit.record({ actorId: actorOf(req).id, action: 'specification.update', entity: 'specification', entityId: id, target: row.label, summary: `Edited specification “${row.label}”`, before: { value: before.value, published: before.published }, after: { value: row.value, published: row.published }, req });
    await this.sync.changed('content');
    return row;
  }

  @Post('specifications/reorder')
  @HttpCode(200)
  @RequirePermission('typology.edit')
  async reorderSpecifications(@Body() dto: IdsDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    await this.prisma.client.$transaction(dto.ids.map((id, i) => this.prisma.client.specification.updateMany({ where: { id, developmentId }, data: { sortOrder: i } })));
    await this.audit.record({ actorId: actorOf(req).id, action: 'specification.reorder', entity: 'specification', summary: `Reordered ${dto.ids.length} specification rows`, rowCount: dto.ids.length, req });
    await this.sync.changed('content');
    return { ok: true };
  }

  @Delete('specifications/:id')
  @RequirePermission('typology.edit')
  async deleteSpecification(@Param('id') id: string, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const row = await this.prisma.client.specification.findFirst({ where: { id, developmentId } });
    if (!row) throw new NotFoundException('No such specification');
    await this.prisma.client.specification.update({ where: { id }, data: { archivedAt: new Date(), published: false } });
    await this.audit.record({ actorId: actorOf(req).id, action: 'specification.archive', entity: 'specification', entityId: id, target: row.label, summary: `Archived specification “${row.label}”`, before: { value: row.value }, req });
    await this.sync.changed('content');
    return { ok: true };
  }

  private async assertType(typologyId: string | null | undefined, developmentId: string) {
    if (!typologyId) return;
    const ok = await this.prisma.client.typology.count({ where: { id: typologyId, developmentId } });
    if (!ok) throw new BadRequestException('That residence type does not belong to this property.');
  }

  // ─── Walkthroughs ──────────────────────────────────────────────────────

  @Get('tours')
  @RequirePermission('content.view')
  async tours() {
    const developmentId = await this.dev.id();
    const rows = await this.prisma.client.tour.findMany({
      where: { developmentId, archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { scenes: { orderBy: { sortOrder: 'asc' }, include: { image: true } } },
    });
    return rows.map(({ scenes, ...t }) => ({
      ...t,
      where: SITE_TOURS.find((x) => x.slug === t.slug)?.where ?? null,
      stations: scenes.length,
      missingImages: scenes.filter((s) => s.published && !s.image).length,
      cover: scenes.find((s) => s.image)?.image ? this.storage.present(scenes.find((s) => s.image)!.image!) : null,
    }));
  }

  @Get('tours/:id')
  @RequirePermission('content.view')
  async tour(@Param('id') id: string) {
    const t = await this.ownedTour(id);
    const scenes = await this.prisma.client.scene.findMany({ where: { tourId: id }, orderBy: { sortOrder: 'asc' }, include: { image: true, video: true } });
    return {
      ...t,
      where: SITE_TOURS.find((x) => x.slug === t.slug)?.where ?? null,
      scenes: scenes.map(({ image, video, ...s }) => ({ ...s, image: image ? this.storage.present(image) : null, video: video ? this.storage.present(video) : null })),
    };
  }

  @Patch('tours/:id')
  @RequirePermission('content.edit')
  async updateTour(@Param('id') id: string, @Body() dto: UpdateTourDto, @Req() req: AdminRequest) {
    requireNonNull(dto, ['name', 'published']);
    const before = await this.ownedTour(id);
    const row = await this.prisma.client.tour.update({ where: { id }, data: defined({ ...dto }) });
    await this.audit.record({ actorId: actorOf(req).id, action: 'tour.update', entity: 'tour', entityId: id, target: row.name, summary: `Edited walkthrough ${row.name}${dto.published !== undefined && dto.published !== before.published ? (dto.published ? ' (published)' : ' (unpublished)') : ''}`, req });
    await this.sync.changed('presentation');
    return row;
  }

  @Post('tours/:id/scenes')
  @RequirePermission('content.edit')
  async createScene(@Param('id') id: string, @Body() dto: CreateSceneDto, @Req() req: AdminRequest) {
    const tour = await this.ownedTour(id);
    const developmentId = await this.dev.id();
    await this.media(dto.imageId, developmentId, 'IMAGE', 'The image');
    await this.media(dto.videoId, developmentId, 'VIDEO', 'The film');
    const max = await this.prisma.client.scene.aggregate({ where: { tourId: id }, _max: { sortOrder: true } });
    const base = dto.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'station';
    let key = base;
    for (let n = 2; await this.prisma.client.scene.count({ where: { tourId: id, key } }); n++) key = `${base}-${n}`;
    const row = await this.prisma.client.scene.create({
      data: { tourId: id, key, ...defined({ ...dto }), label: dto.label, sortOrder: (max._max.sortOrder ?? -1) + 1 },
    });
    await this.audit.record({ actorId: actorOf(req).id, action: 'tour.scene.create', entity: 'tour', entityId: id, target: tour.name, summary: `Added station “${row.label}” to ${tour.name}`, req });
    await this.sync.changed('presentation');
    return row;
  }

  @Patch('tours/:id/scenes/:sceneId')
  @RequirePermission('content.edit')
  async updateScene(@Param('id') id: string, @Param('sceneId') sceneId: string, @Body() dto: UpdateSceneDto, @Req() req: AdminRequest) {
    requireNonNull(dto, ['label', 'published']);
    const tour = await this.ownedTour(id);
    const developmentId = await this.dev.id();
    const scene = await this.prisma.client.scene.findFirst({ where: { id: sceneId, tourId: id } });
    if (!scene) throw new NotFoundException('No such station');
    await this.media(dto.imageId, developmentId, 'IMAGE', 'The image');
    await this.media(dto.videoId, developmentId, 'VIDEO', 'The film');
    const row = await this.prisma.client.scene.update({ where: { id: sceneId }, data: defined({ ...dto }) });
    await this.audit.record({ actorId: actorOf(req).id, action: 'tour.scene.update', entity: 'tour', entityId: id, target: tour.name, summary: `Edited station “${row.label}” of ${tour.name}`, req });
    await this.sync.changed('presentation');
    return row;
  }

  @Post('tours/:id/scenes/reorder')
  @HttpCode(200)
  @RequirePermission('content.edit')
  async reorderScenes(@Param('id') id: string, @Body() dto: IdsDto, @Req() req: AdminRequest) {
    const tour = await this.ownedTour(id);
    await this.prisma.client.$transaction(dto.ids.map((sceneId, i) => this.prisma.client.scene.updateMany({ where: { id: sceneId, tourId: id }, data: { sortOrder: i } })));
    await this.audit.record({ actorId: actorOf(req).id, action: 'tour.scene.reorder', entity: 'tour', entityId: id, target: tour.name, summary: `Reordered the stations of ${tour.name}`, rowCount: dto.ids.length, req });
    await this.sync.changed('presentation');
    return { ok: true };
  }

  @Delete('tours/:id/scenes/:sceneId')
  @RequirePermission('content.edit')
  async deleteScene(@Param('id') id: string, @Param('sceneId') sceneId: string, @Req() req: AdminRequest) {
    const tour = await this.ownedTour(id);
    const scene = await this.prisma.client.scene.findFirst({ where: { id: sceneId, tourId: id } });
    if (!scene) throw new NotFoundException('No such station');
    await this.prisma.client.$transaction([
      this.prisma.client.hotspot.updateMany({ where: { targetSceneId: sceneId }, data: { targetSceneId: null } }),
      this.prisma.client.scene.delete({ where: { id: sceneId } }),
    ]);
    await this.audit.record({ actorId: actorOf(req).id, action: 'tour.scene.delete', entity: 'tour', entityId: id, target: tour.name, summary: `Removed station “${scene.label}” from ${tour.name}`, req });
    await this.sync.changed('presentation');
    return { ok: true };
  }

  private async ownedTour(id: string) {
    const t = await this.prisma.client.tour.findFirst({ where: { id, developmentId: await this.dev.id() } });
    if (!t) throw new NotFoundException('No such walkthrough');
    return t;
  }

  // ─── The film ──────────────────────────────────────────────────────────

  @Get('film')
  @RequirePermission('content.view')
  async film() {
    const developmentId = await this.dev.id();
    const f = await this.prisma.client.videoAsset.findFirst({
      where: { developmentId },
      orderBy: { createdAt: 'asc' },
      include: { media: true, posterMedia: true, chapters: { orderBy: [{ sortOrder: 'asc' }, { startSec: 'asc' }] } },
    });
    if (!f) return null;
    const { media, posterMedia, ...rest } = f;
    return { ...rest, media: media ? this.storage.present(media) : null, posterMedia: posterMedia ? this.storage.present(posterMedia) : null };
  }

  @Put('film')
  @RequirePermission('content.edit')
  async saveFilm(@Body() dto: UpdateFilmDto, @Req() req: AdminRequest) {
    requireNonNull(dto, ['label', 'published', 'durationSec']);
    const developmentId = await this.dev.id();
    await this.media(dto.mediaId, developmentId, 'VIDEO', 'The film');
    await this.media(dto.posterMediaId, developmentId, 'IMAGE', 'The poster');
    if (dto.chapters) {
      const duration = dto.durationSec ?? (await this.prisma.client.videoAsset.findFirst({ where: { developmentId }, select: { durationSec: true } }))?.durationSec ?? Infinity;
      if (dto.chapters.some((c) => c.startSec > duration)) throw new BadRequestException('A chapter starts after the end of the film.');
    }
    const { chapters, uploadDate, ...rest } = dto;
    // The date arrives as a string from the form; the column is a timestamp.
    const fields = { ...rest, ...(uploadDate === undefined ? {} : { uploadDate: uploadDate ? new Date(uploadDate) : null }) };
    const existing = await this.prisma.client.videoAsset.findFirst({ where: { developmentId }, orderBy: { createdAt: 'asc' } });
    const film = await this.prisma.client.$transaction(async (tx) => {
      const row = existing
        ? await tx.videoAsset.update({ where: { id: existing.id }, data: defined({ ...fields }) })
        : await tx.videoAsset.create({
            data: { developmentId, key: `film-${developmentId}`, label: fields.label ?? 'The film', kind: 'WALKTHROUGH', posterKey: '', durationSec: fields.durationSec ?? 0, width: 1920, height: 1080, ...defined({ ...fields }) },
          });
      if (chapters) {
        const sorted = [...chapters].sort((a, b) => a.startSec - b.startSec);
        await tx.videoChapter.deleteMany({ where: { videoAssetId: row.id } });
        await tx.videoChapter.createMany({ data: sorted.map((c, i) => ({ videoAssetId: row.id, startSec: c.startSec, label: c.label.trim(), place: c.place ?? null, sortOrder: i })) });
      }
      return row;
    });
    await this.audit.record({ actorId: actorOf(req).id, action: 'film.update', entity: 'film', entityId: film.id, target: film.label, summary: `Edited the film${chapters ? ` (${chapters.length} chapters)` : ''}`, req });
    await this.sync.changed('presentation');
    return this.film();
  }

  // ─── SEO ───────────────────────────────────────────────────────────────

  @Get('seo')
  @RequirePermission('content.view')
  async seo() {
    const developmentId = await this.dev.id();
    const [site, pages] = await Promise.all([
      this.prisma.client.seoMeta.findUnique({ where: { developmentId } }),
      this.prisma.client.seoPage.findMany({ where: { developmentId }, include: { ogImage: true } }),
    ]);
    return {
      site,
      routes: SEO_ROUTES.map((r) => {
        const row = pages.find((p) => p.path === r.path);
        return { ...r, title: row?.title ?? null, description: row?.description ?? null, noindex: row?.noindex ?? false, ogImage: row?.ogImage ? this.storage.present(row.ogImage) : null, updatedAt: row?.updatedAt ?? null };
      }),
    };
  }

  @Put('seo/site')
  @RequirePermission('content.edit')
  async saveSiteSeo(@Body() dto: UpdateSiteSeoDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const before = await this.prisma.client.seoMeta.findUnique({ where: { developmentId } });
    const row = await this.prisma.client.seoMeta.upsert({
      where: { developmentId },
      create: { developmentId, title: dto.title ?? '', description: dto.description ?? '', keywords: dto.keywords ?? [] },
      update: defined({ ...dto }),
    });
    await this.audit.record({ actorId: actorOf(req).id, action: 'seo.update', entity: 'seo', entityId: 'site', target: 'Site-wide', summary: 'Edited the site-wide search metadata', before: before ? { title: before.title, description: before.description } : null, after: { title: row.title, description: row.description }, req });
    await this.sync.changed('seo');
    return row;
  }

  @Put('seo/pages')
  @RequirePermission('content.edit')
  async saveSeoPage(@Body() dto: UpdateSeoPageDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    await this.media(dto.ogImageId, developmentId, 'IMAGE', 'The share image');
    const { path, ...fields } = dto;
    const row = await this.prisma.client.seoPage.upsert({
      where: { developmentId_path: { developmentId, path } },
      create: { developmentId, path, title: fields.title?.trim() || null, description: fields.description?.trim() || null, ogImageId: fields.ogImageId ?? null, noindex: fields.noindex ?? false, updatedById: actorOf(req).id },
      update: { ...defined({ title: fields.title === undefined ? undefined : fields.title?.trim() || null, description: fields.description === undefined ? undefined : fields.description?.trim() || null, ogImageId: fields.ogImageId, noindex: fields.noindex }), updatedById: actorOf(req).id },
    });
    const label = SEO_ROUTES.find((r) => r.path === path)?.label ?? path;
    await this.audit.record({ actorId: actorOf(req).id, action: 'seo.update', entity: 'seo', entityId: path, target: label, summary: `Edited search metadata for ${label}`, after: { title: row.title, description: row.description, noindex: row.noindex }, req });
    await this.sync.changed('seo');
    return row;
  }

  // ─── Website propagation ───────────────────────────────────────────────

  @Get('website/sync')
  @RequirePermission('content.view')
  syncHealth() {
    return this.revalidate.health();
  }

  @Post('website/sync/retry')
  @HttpCode(200)
  @RequirePermission('content.edit')
  async retrySync(@Req() req: AdminRequest) {
    const count = await this.revalidate.retryFailed();
    await this.audit.record({ actorId: actorOf(req).id, action: 'website.sync.retry', entity: 'website', summary: `Retried ${count} website updates that had failed`, rowCount: count, req });
    return { retried: count };
  }

  @Post('website/refresh')
  @HttpCode(200)
  @RequirePermission('content.edit')
  async refreshAll(@Req() req: AdminRequest) {
    await this.sync.changed('all');
    await this.audit.record({ actorId: actorOf(req).id, action: 'website.refresh', entity: 'website', summary: 'Refreshed every page of the website', req });
    return { ok: true };
  }
}
