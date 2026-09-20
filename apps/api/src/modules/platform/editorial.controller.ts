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
  Post as HttpPost,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { slugify } from '@avida/types';
import { AuditService } from '../../common/audit.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { PrismaService } from '../../common/prisma.service.js';
import { PublicSync } from '../../common/public-sync.service.js';
import { StorageService } from '../../common/storage.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf, defined } from './actor.js';
import { UpsertLocationPageDto, UpsertPostDto } from './dto.js';

/**
 * §SEO — the two page types that exist to be found: neighbourhood pages and
 * the articles under /insights. Both are ordinary CMS records; their search
 * metadata lives in the same SeoEntity table as every other page's.
 *
 * Renaming either changes its URL, so the old path is kept as a 301 rather
 * than left to rot: a link shared last month must still arrive somewhere.
 */
@Controller('admin/locations')
@UseGuards(AdminGuard)
@UseInterceptors(NoStoreInterceptor)
export class LocationPagesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly sync: PublicSync,
  ) {}

  @Get()
  @RequirePermission('content.view')
  async list() {
    const developmentId = await this.dev.id();
    const rows = await this.prisma.client.locationPage.findMany({
      where: { developmentId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { heroImage: true },
    });
    return rows.map((r) => ({ ...r, heroImage: r.heroImage ? this.storage.present(r.heroImage) : null }));
  }

  @Get(':id')
  @RequirePermission('content.view')
  async one(@Param('id') id: string) {
    const developmentId = await this.dev.id();
    const row = await this.prisma.client.locationPage.findFirst({ where: { id, developmentId }, include: { heroImage: true } });
    if (!row) throw new NotFoundException('No such location page');
    return { ...row, heroImage: row.heroImage ? this.storage.present(row.heroImage) : null };
  }

  @HttpPost()
  @RequirePermission('content.edit')
  async create(@Body() dto: UpsertLocationPageDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('A location page needs a name.');
    const slug = dto.slug ?? slugify(name);
    await this.assertFreeSlug(developmentId, slug, null);
    const row = await this.prisma.client.locationPage.create({
      data: {
        developmentId,
        name,
        slug,
        kicker: dto.kicker?.trim() || null,
        title: dto.title?.trim() || null,
        lede: dto.lede?.trim() || null,
        body: dto.body ?? null,
        locality: dto.locality?.trim() || null,
        region: dto.region?.trim() || null,
        country: dto.country ?? 'RW',
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        categories: dto.categories ?? [],
        heroImageId: dto.heroImageId ?? null,
        published: dto.published ?? false,
        sortOrder: dto.sortOrder ?? 0,
        publishedAt: dto.published ? new Date() : null,
        updatedById: actorOf(req).id,
      },
    });
    await this.audit.record({ actorId: actorOf(req).id, action: 'location-page.create', entity: 'location-page', entityId: row.id, target: row.name, summary: `Created the location page ${row.name}`, req });
    await this.sync.changed('content');
    return row;
  }

  @Patch(':id')
  @RequirePermission('content.edit')
  async update(@Param('id') id: string, @Body() dto: UpsertLocationPageDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const before = await this.prisma.client.locationPage.findFirst({ where: { id, developmentId } });
    if (!before) throw new NotFoundException('No such location page');
    const slug = dto.slug ?? (dto.name ? slugify(dto.name) : before.slug);
    if (slug !== before.slug) await this.assertFreeSlug(developmentId, slug, id);
    const row = await this.prisma.client.locationPage.update({
      where: { id },
      data: {
        ...defined({
          name: dto.name?.trim(),
          kicker: dto.kicker === undefined ? undefined : dto.kicker?.trim() || null,
          title: dto.title === undefined ? undefined : dto.title?.trim() || null,
          lede: dto.lede === undefined ? undefined : dto.lede?.trim() || null,
          body: dto.body,
          locality: dto.locality === undefined ? undefined : dto.locality?.trim() || null,
          region: dto.region === undefined ? undefined : dto.region?.trim() || null,
          country: dto.country,
          latitude: dto.latitude,
          longitude: dto.longitude,
          categories: dto.categories,
          heroImageId: dto.heroImageId,
          published: dto.published,
          sortOrder: dto.sortOrder,
        }),
        slug,
        ...(dto.published && !before.published ? { publishedAt: new Date() } : {}),
        updatedById: actorOf(req).id,
      },
    });
    if (slug !== before.slug) await this.keepOldUrlAlive(developmentId, `/locations/${before.slug}`, `/locations/${slug}`, actorOf(req).id);
    await this.audit.record({ actorId: actorOf(req).id, action: 'location-page.update', entity: 'location-page', entityId: id, target: row.name, summary: `Edited the location page ${row.name}`, before: { slug: before.slug, published: before.published }, after: { slug: row.slug, published: row.published }, req });
    await this.sync.changed('content');
    return row;
  }

  @Delete(':id')
  @RequirePermission('content.edit')
  @HttpCode(204)
  async remove(@Param('id') id: string, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const row = await this.prisma.client.locationPage.findFirst({ where: { id, developmentId } });
    if (!row) throw new NotFoundException('No such location page');
    await this.prisma.client.$transaction([
      this.prisma.client.seoEntity.deleteMany({ where: { developmentId, entityType: 'LOCATION_PAGE', entityId: id } }),
      this.prisma.client.locationPage.delete({ where: { id } }),
    ]);
    await this.audit.record({ actorId: actorOf(req).id, action: 'location-page.delete', entity: 'location-page', entityId: id, target: row.name, summary: `Deleted the location page ${row.name}`, req });
    await this.sync.changed('content');
  }

  private async assertFreeSlug(developmentId: string, slug: string, exceptId: string | null) {
    const clash = await this.prisma.client.locationPage.findFirst({ where: { developmentId, slug, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
    if (clash) throw new BadRequestException(`Another location page already uses /locations/${slug}.`);
  }

  private async keepOldUrlAlive(developmentId: string, fromPath: string, toPath: string, actorId: string) {
    await this.prisma.client.redirect.upsert({
      where: { developmentId_fromPath: { developmentId, fromPath } },
      create: { developmentId, fromPath, toPath, statusCode: 301, reason: 'The page was renamed', createdById: actorId },
      update: { toPath, enabled: true },
    });
    // A chain (old → older → new) costs a hop and loses a little authority, so
    // anything that pointed at the old path is repointed at the new one.
    await this.prisma.client.redirect.updateMany({ where: { developmentId, toPath: fromPath }, data: { toPath } });
  }
}

@Controller('admin/posts')
@UseGuards(AdminGuard)
@UseInterceptors(NoStoreInterceptor)
export class PostsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly sync: PublicSync,
  ) {}

  @Get()
  @RequirePermission('content.view')
  async list() {
    const developmentId = await this.dev.id();
    const rows = await this.prisma.client.post.findMany({
      where: { developmentId },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      include: { heroImage: true },
    });
    return rows.map((r) => ({ ...r, heroImage: r.heroImage ? this.storage.present(r.heroImage) : null }));
  }

  @Get(':id')
  @RequirePermission('content.view')
  async one(@Param('id') id: string) {
    const developmentId = await this.dev.id();
    const row = await this.prisma.client.post.findFirst({ where: { id, developmentId }, include: { heroImage: true } });
    if (!row) throw new NotFoundException('No such article');
    return { ...row, heroImage: row.heroImage ? this.storage.present(row.heroImage) : null };
  }

  @HttpPost()
  @RequirePermission('content.edit')
  async create(@Body() dto: UpsertPostDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const title = dto.title?.trim();
    if (!title) throw new BadRequestException('An article needs a title.');
    const slug = dto.slug ?? slugify(title);
    await this.assertFreeSlug(developmentId, slug, null);
    const body = dto.body ?? '';
    const row = await this.prisma.client.post.create({
      data: {
        developmentId,
        title,
        slug,
        excerpt: dto.excerpt?.trim() || null,
        body,
        category: dto.category ?? 'Guides',
        tags: dto.tags ?? [],
        authorName: dto.authorName?.trim() || null,
        readMinutes: dto.readMinutes ?? readingTime(body),
        heroImageId: dto.heroImageId ?? null,
        published: dto.published ?? false,
        publishedAt: dto.published ? new Date() : null,
        updatedById: actorOf(req).id,
      },
    });
    await this.audit.record({ actorId: actorOf(req).id, action: 'post.create', entity: 'post', entityId: row.id, target: row.title, summary: `Wrote the article ${row.title}`, req });
    await this.sync.changed('content');
    return row;
  }

  @Patch(':id')
  @RequirePermission('content.edit')
  async update(@Param('id') id: string, @Body() dto: UpsertPostDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const before = await this.prisma.client.post.findFirst({ where: { id, developmentId } });
    if (!before) throw new NotFoundException('No such article');
    const slug = dto.slug ?? (dto.title ? slugify(dto.title) : before.slug);
    if (slug !== before.slug) await this.assertFreeSlug(developmentId, slug, id);
    const row = await this.prisma.client.post.update({
      where: { id },
      data: {
        ...defined({
          title: dto.title?.trim(),
          excerpt: dto.excerpt === undefined ? undefined : dto.excerpt?.trim() || null,
          body: dto.body,
          category: dto.category,
          tags: dto.tags,
          authorName: dto.authorName === undefined ? undefined : dto.authorName?.trim() || null,
          readMinutes: dto.readMinutes ?? (dto.body ? readingTime(dto.body) : undefined),
          heroImageId: dto.heroImageId,
          published: dto.published,
        }),
        slug,
        ...(dto.published && !before.published ? { publishedAt: new Date() } : {}),
        updatedById: actorOf(req).id,
      },
    });
    if (slug !== before.slug) {
      await this.prisma.client.redirect.upsert({
        where: { developmentId_fromPath: { developmentId, fromPath: `/insights/${before.slug}` } },
        create: { developmentId, fromPath: `/insights/${before.slug}`, toPath: `/insights/${slug}`, statusCode: 301, reason: 'The article was renamed', createdById: actorOf(req).id },
        update: { toPath: `/insights/${slug}`, enabled: true },
      });
      await this.prisma.client.redirect.updateMany({ where: { developmentId, toPath: `/insights/${before.slug}` }, data: { toPath: `/insights/${slug}` } });
    }
    await this.audit.record({ actorId: actorOf(req).id, action: 'post.update', entity: 'post', entityId: id, target: row.title, summary: `Edited the article ${row.title}`, before: { slug: before.slug, published: before.published }, after: { slug: row.slug, published: row.published }, req });
    await this.sync.changed('content');
    return row;
  }

  @Delete(':id')
  @RequirePermission('content.edit')
  @HttpCode(204)
  async remove(@Param('id') id: string, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const row = await this.prisma.client.post.findFirst({ where: { id, developmentId } });
    if (!row) throw new NotFoundException('No such article');
    await this.prisma.client.$transaction([
      this.prisma.client.seoEntity.deleteMany({ where: { developmentId, entityType: 'POST', entityId: id } }),
      this.prisma.client.post.delete({ where: { id } }),
    ]);
    await this.audit.record({ actorId: actorOf(req).id, action: 'post.delete', entity: 'post', entityId: id, target: row.title, summary: `Deleted the article ${row.title}`, req });
    await this.sync.changed('content');
  }

  private async assertFreeSlug(developmentId: string, slug: string, exceptId: string | null) {
    const clash = await this.prisma.client.post.findFirst({ where: { developmentId, slug, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
    if (clash) throw new BadRequestException(`Another article already uses /insights/${slug}.`);
  }
}

/** Reading time at 220 words a minute, rounded up — what the byline shows. */
function readingTime(markdown: string): number {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}
