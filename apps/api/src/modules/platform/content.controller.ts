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
import { Prisma } from '@avida/db';
import { CONTENT_PAGES, contentPageDef, type ContentField } from '@avida/types';
import { AuditService } from '../../common/audit.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { PrismaService } from '../../common/prisma.service.js';
import { PublicSync } from '../../common/public-sync.service.js';
import { StorageService } from '../../common/storage.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf, assertCan, defined, publishStamp, requireNonNull, toDate } from './actor.js';
import {
  CreateAmenityDto,
  CreateFaqDto,
  CreateProgressDto,
  IdsDto,
  UpdateAmenityDto,
  UpdateFaqDto,
  UpdatePageDto,
  UpdateProgressDto,
} from './dto.js';

const LIMITS: Record<string, number> = { text: 300, textarea: 8000, url: 500, media: 40 };

/**
 * §21 — the lightweight CMS: page copy, FAQs, construction progress and
 * amenities. Page fields are declared in @avida/types (CONTENT_PAGES); a key
 * not declared there is refused, so the site never reads an undocumented one.
 */
@Controller('admin')
@UseGuards(AdminGuard)
@UseInterceptors(NoStoreInterceptor)
export class ContentController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly sync: PublicSync,
  ) {}

  // ─── Pages ─────────────────────────────────────────────────────────────

  @Get('pages')
  @RequirePermission('content.view')
  async pages() {
    const developmentId = await this.dev.id();
    const rows = await this.prisma.client.contentPage.findMany({ where: { developmentId } });
    const users = new Map((await this.prisma.client.adminUser.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    return CONTENT_PAGES.map((def) => {
      const row = rows.find((r) => r.key === def.key);
      return { ...def, content: (row?.content ?? {}) as Record<string, unknown>, hasDraft: Boolean(row?.draftContent), published: row?.published ?? true, updatedAt: row?.updatedAt ?? null, publishedAt: row?.publishedAt ?? null, updatedBy: row?.updatedById ? (users.get(row.updatedById) ?? null) : null };
    });
  }

  @Get('pages/:key')
  @RequirePermission('content.view')
  async page(@Param('key') key: string) {
    const def = contentPageDef(key);
    if (!def) throw new NotFoundException('No such page');
    const developmentId = await this.dev.id();
    const row = await this.prisma.client.contentPage.findUnique({ where: { developmentId_key: { developmentId, key } } });
    const published = (row?.content ?? {}) as Record<string, unknown>;
    const draft = (row?.draftContent ?? null) as Record<string, unknown> | null;
    // The editor works on the draft over the published copy (§40.2). Keys a
    // field def no longer declares are stale rows from an older shape — drop
    // them here so the editor never sends them back and trips savePage.
    const declared = new Set(def.fields.map((f) => f.key));
    const content = Object.fromEntries(
      Object.entries({ ...published, ...(draft ?? {}) }).filter(([k]) => declared.has(k)),
    );
    const mediaIds = def.fields.filter((f) => f.type === 'media').map((f) => content[f.key]).filter((v): v is string => typeof v === 'string');
    const media = mediaIds.length ? await this.prisma.client.media.findMany({ where: { id: { in: mediaIds }, developmentId } }) : [];
    const draftFields = draft ? Object.keys(draft).filter((k) => JSON.stringify(published[k] ?? null) !== JSON.stringify(draft[k] ?? null)) : [];
    return { ...def, content, published: row?.published ?? true, publishedContent: published, draftFields, hasDraft: draftFields.length > 0, draftUpdatedAt: row?.draftUpdatedAt ?? null, publishedAt: row?.publishedAt ?? null, updatedAt: row?.updatedAt ?? null, media: Object.fromEntries(media.map((m) => [m.id, this.storage.present(m)])) };
  }

  /**
   * §40.2 — an edit is saved as a draft. Visitors keep reading the published
   * copy until someone with `content.publish` publishes it (or saves with
   * `publish: true`); the draft is visible in a preview meanwhile.
   */
  @Put('pages/:key')
  @RequirePermission('content.edit')
  async savePage(@Param('key') key: string, @Body() dto: UpdatePageDto, @Req() req: AdminRequest) {
    const def = contentPageDef(key);
    if (!def) throw new NotFoundException('No such page');
    const actor = actorOf(req);
    if (dto.publish || dto.published !== undefined) assertCan(actor, 'content.publish');
    const developmentId = await this.dev.id();
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(dto.content)) {
      const field = def.fields.find((f) => f.key === k);
      if (!field) throw new BadRequestException(`“${k}” is not a field of the ${def.title} page.`);
      clean[k] = await this.validateField(field, v, developmentId);
    }
    const existing = await this.prisma.client.contentPage.findUnique({ where: { developmentId_key: { developmentId, key } } });
    const published = (existing?.content ?? {}) as Record<string, unknown>;
    const draft = { ...((existing?.draftContent ?? {}) as Record<string, unknown>), ...clean };
    const changed = Object.keys(clean).filter((k) => JSON.stringify(published[k] ?? null) !== JSON.stringify(clean[k] ?? null));
    const now = new Date();

    const row = dto.publish
      ? await this.prisma.client.contentPage.upsert({
          where: { developmentId_key: { developmentId, key } },
          create: { developmentId, key, title: def.title, content: draft as Prisma.InputJsonValue, published: dto.published ?? true, publishedAt: now, publishedById: actor.id, updatedById: actor.id },
          update: { content: { ...published, ...draft } as Prisma.InputJsonValue, draftContent: Prisma.DbNull, draftUpdatedAt: null, draftUpdatedById: null, ...(dto.published !== undefined ? { published: dto.published } : {}), publishedAt: now, publishedById: actor.id, updatedById: actor.id },
        })
      : await this.prisma.client.contentPage.upsert({
          where: { developmentId_key: { developmentId, key } },
          create: { developmentId, key, title: def.title, content: {}, draftContent: draft as Prisma.InputJsonValue, draftUpdatedAt: now, draftUpdatedById: actor.id, published: true, updatedById: actor.id },
          update: { draftContent: draft as Prisma.InputJsonValue, draftUpdatedAt: now, draftUpdatedById: actor.id, ...(dto.published !== undefined ? { published: dto.published } : {}), updatedById: actor.id },
        });
    if (changed.length || dto.published !== undefined) {
      await this.audit.record({
        actorId: actor.id,
        action: dto.publish ? 'content.publish' : 'content.draft',
        entity: 'page',
        entityId: key,
        target: def.title,
        summary: `${dto.publish ? 'Published' : 'Saved a draft of'} ${def.title}: ${changed.map((k) => def.fields.find((f) => f.key === k)!.label.toLowerCase()).join(', ') || 'visibility'}`,
        before: Object.fromEntries(changed.map((k) => [k, published[k] ?? null])),
        after: Object.fromEntries(changed.map((k) => [k, clean[k] ?? null])),
        req,
      });
      if (dto.publish || dto.published !== undefined) await this.sync.changed('content');
    }
    return row;
  }

  private async validateField(field: ContentField, value: unknown, developmentId: string): Promise<unknown> {
    if (value === null || value === '') return null;
    if (field.type === 'list') {
      if (!Array.isArray(value) || value.length > 30) throw new BadRequestException(`${field.label} must be a list of up to 30 items.`);
      return value.map((item, i) => {
        const o = item as { title?: unknown; body?: unknown };
        if (typeof o?.title !== 'string' || typeof o?.body !== 'string' || o.title.length > 200 || o.body.length > 2000) {
          throw new BadRequestException(`${field.label}, item ${i + 1}: needs a title (up to 200 characters) and text (up to 2,000).`);
        }
        return { title: o.title.trim(), body: o.body.trim() };
      });
    }
    if (typeof value !== 'string') throw new BadRequestException(`${field.label} must be text.`);
    if (value.length > (LIMITS[field.type] ?? 300)) throw new BadRequestException(`${field.label} is too long.`);
    if (field.type === 'url' && !/^(\/|https?:\/\/|mailto:|tel:)/.test(value)) {
      throw new BadRequestException(`${field.label} must start with /, https://, mailto: or tel:.`);
    }
    if (field.type === 'media') {
      const ok = await this.prisma.client.media.count({ where: { id: value, developmentId } });
      if (!ok) throw new BadRequestException(`${field.label}: that file does not belong to this property.`);
    }
    return value.trim();
  }

  // ─── FAQs ──────────────────────────────────────────────────────────────

  @Get('faqs')
  @RequirePermission('content.view')
  async faqs() {
    return this.prisma.client.faq.findMany({ where: { developmentId: await this.dev.id(), archivedAt: null }, orderBy: { sortOrder: 'asc' } });
  }

  @Post('faqs')
  @RequirePermission('content.edit')
  async createFaq(@Body() dto: CreateFaqDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const max = await this.prisma.client.faq.aggregate({ where: { developmentId }, _max: { sortOrder: true } });
    const faq = await this.prisma.client.faq.create({
      data: { developmentId, question: dto.question, answerMd: dto.answerMd, category: dto.category ?? 'General', ...publishStamp(actorOf(req), dto.published, true), sortOrder: (max._max.sortOrder ?? -1) + 1 },
    });
    await this.audit.record({ actorId: actorOf(req).id, action: 'faq.create', entity: 'faq', entityId: faq.id, target: faq.question, summary: `Added FAQ “${faq.question}”`, req });
    await this.sync.changed('content');
    return faq;
  }

  @Patch('faqs/:id')
  @RequirePermission('content.edit')
  async updateFaq(@Param('id') id: string, @Body() dto: UpdateFaqDto, @Req() req: AdminRequest) {
    requireNonNull(dto, ['question', 'answerMd', 'category', 'published']);
    await this.ownedFaq(id);
    const faq = await this.prisma.client.faq.update({ where: { id }, data: { ...defined({ ...dto, published: undefined }), ...publishStamp(actorOf(req), dto.published) } });
    await this.audit.record({ actorId: actorOf(req).id, action: 'faq.update', entity: 'faq', entityId: id, target: faq.question, summary: `Edited FAQ “${faq.question}”`, req });
    await this.sync.changed('content');
    return faq;
  }

  @Post('faqs/reorder')
  @HttpCode(200)
  @RequirePermission('content.edit')
  async reorderFaqs(@Body() dto: IdsDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    await this.prisma.client.$transaction(dto.ids.map((id, i) => this.prisma.client.faq.updateMany({ where: { id, developmentId }, data: { sortOrder: i } })));
    await this.audit.record({ actorId: actorOf(req).id, action: 'faq.reorder', entity: 'faq', summary: `Reordered ${dto.ids.length} FAQs`, rowCount: dto.ids.length, req });
    await this.sync.changed('content');
    return { ok: true };
  }

  @Delete('faqs/:id')
  @RequirePermission('content.edit')
  async deleteFaq(@Param('id') id: string, @Req() req: AdminRequest) {
    const faq = await this.ownedFaq(id);
    await this.prisma.client.faq.update({ where: { id }, data: { archivedAt: new Date(), published: false } });
    await this.audit.record({ actorId: actorOf(req).id, action: 'faq.archive', entity: 'faq', entityId: id, target: faq.question, summary: `Archived FAQ “${faq.question}”`, req });
    await this.sync.changed('content');
    return { ok: true };
  }

  private async ownedFaq(id: string) {
    const faq = await this.prisma.client.faq.findFirst({ where: { id, developmentId: await this.dev.id() } });
    if (!faq) throw new NotFoundException('No such FAQ');
    return faq;
  }

  // ─── Construction progress ─────────────────────────────────────────────

  @Get('progress')
  @RequirePermission('content.view')
  async progress() {
    return this.prisma.client.progressUpdate.findMany({ where: { developmentId: await this.dev.id(), archivedAt: null }, orderBy: { capturedOn: 'desc' } });
  }

  @Post('progress')
  @RequirePermission('content.edit')
  async createProgress(@Body() dto: CreateProgressDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const row = await this.prisma.client.progressUpdate.create({
      data: {
        developmentId,
        capturedOn: new Date(dto.capturedOn),
        title: dto.title,
        bodyMd: dto.bodyMd ?? null,
        percentComplete: dto.percentComplete ?? null,
        ...publishStamp(actorOf(req), dto.published, true),
        mediaAssetIds: dto.mediaAssetIds ?? [],
      },
    });
    await this.audit.record({ actorId: actorOf(req).id, action: 'progress.create', entity: 'progress', entityId: row.id, target: row.title, summary: `Posted progress update “${row.title}”`, req });
    await this.sync.changed('content');
    return row;
  }

  @Patch('progress/:id')
  @RequirePermission('content.edit')
  async updateProgress(@Param('id') id: string, @Body() dto: UpdateProgressDto, @Req() req: AdminRequest) {
    requireNonNull(dto, ['capturedOn', 'title', 'published', 'mediaAssetIds']);
    const developmentId = await this.dev.id();
    const exists = await this.prisma.client.progressUpdate.count({ where: { id, developmentId } });
    if (!exists) throw new NotFoundException('No such progress update');
    const row = await this.prisma.client.progressUpdate.update({ where: { id }, data: { ...defined({ ...dto, published: undefined, capturedOn: toDate(dto.capturedOn) ?? undefined }), ...publishStamp(actorOf(req), dto.published) } });
    await this.audit.record({ actorId: actorOf(req).id, action: 'progress.update', entity: 'progress', entityId: id, target: row.title, summary: `Edited progress update “${row.title}”`, req });
    await this.sync.changed('content');
    return row;
  }

  @Delete('progress/:id')
  @RequirePermission('content.edit')
  async deleteProgress(@Param('id') id: string, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const row = await this.prisma.client.progressUpdate.findFirst({ where: { id, developmentId } });
    if (!row) throw new NotFoundException('No such progress update');
    await this.prisma.client.progressUpdate.update({ where: { id }, data: { archivedAt: new Date(), published: false } });
    await this.audit.record({ actorId: actorOf(req).id, action: 'progress.archive', entity: 'progress', entityId: id, target: row.title, summary: `Archived progress update “${row.title}”`, req });
    await this.sync.changed('content');
    return { ok: true };
  }

  // ─── Amenities ─────────────────────────────────────────────────────────

  @Get('amenities')
  @RequirePermission('content.view')
  async amenities() {
    const developmentId = await this.dev.id();
    const rows = await this.prisma.client.amenity.findMany({
      where: { developmentId, archivedAt: null },
      orderBy: { sortOrder: 'asc' },
      include: { media: { orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }] } },
    });
    return rows.map(({ media, ...a }) => ({
      ...a,
      mediaCount: media.length,
      cover: media.find((m) => m.kind === 'IMAGE') ? this.storage.present(media.find((m) => m.kind === 'IMAGE')!) : null,
      media: media.map((m) => this.storage.present(m)),
    }));
  }

  @Post('amenities')
  @RequirePermission('amenity.edit')
  async createAmenity(@Body() dto: CreateAmenityDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    if (dto.slug) await this.assertAmenitySlug(dto.slug, developmentId);
    const max = await this.prisma.client.amenity.aggregate({ where: { developmentId }, _max: { sortOrder: true } });
    const row = await this.prisma.client.amenity.create({
      data: {
        developmentId,
        name: dto.name,
        slug: dto.slug ?? null,
        shortDescription: dto.shortDescription ?? null,
        descriptionMd: dto.descriptionMd ?? null,
        iconKey: dto.iconKey ?? null,
        location: dto.location ?? null,
        specifications: (dto.specifications ?? []) as unknown as Prisma.InputJsonValue,
        ...publishStamp(actorOf(req), dto.published, true),
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
    });
    await this.audit.record({ actorId: actorOf(req).id, action: 'amenity.create', entity: 'amenity', entityId: row.id, target: row.name, summary: `Added amenity ${row.name}`, req });
    await this.sync.changed('content');
    return row;
  }

  @Patch('amenities/:id')
  @RequirePermission('amenity.edit')
  async updateAmenity(@Param('id') id: string, @Body() dto: UpdateAmenityDto, @Req() req: AdminRequest) {
    requireNonNull(dto, ['name', 'published', 'specifications']);
    const developmentId = await this.dev.id();
    const before = await this.prisma.client.amenity.findFirst({ where: { id, developmentId } });
    if (!before) throw new NotFoundException('No such amenity');
    if (dto.slug) await this.assertAmenitySlug(dto.slug, developmentId, id);
    const row = await this.prisma.client.amenity.update({
      where: { id },
      data: { ...defined({ ...dto, published: undefined, specifications: dto.specifications as unknown as Prisma.InputJsonValue | undefined }), ...publishStamp(actorOf(req), dto.published) },
    });
    await this.audit.record({ actorId: actorOf(req).id, action: 'amenity.update', entity: 'amenity', entityId: id, target: row.name, summary: `Edited amenity ${row.name}`, req });
    await this.sync.changed('content');
    return row;
  }

  @Post('amenities/reorder')
  @HttpCode(200)
  @RequirePermission('amenity.edit')
  async reorderAmenities(@Body() dto: IdsDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    await this.prisma.client.$transaction(dto.ids.map((id, i) => this.prisma.client.amenity.updateMany({ where: { id, developmentId }, data: { sortOrder: i } })));
    await this.audit.record({ actorId: actorOf(req).id, action: 'amenity.reorder', entity: 'amenity', summary: `Reordered ${dto.ids.length} amenities`, rowCount: dto.ids.length, req });
    await this.sync.changed('content');
    return { ok: true };
  }

  @Delete('amenities/:id')
  @RequirePermission('amenity.edit')
  async deleteAmenity(@Param('id') id: string, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const row = await this.prisma.client.amenity.findFirst({ where: { id, developmentId } });
    if (!row) throw new NotFoundException('No such amenity');
    // Archived, not deleted: its photographs stay attached, so a restore brings it back whole.
    await this.prisma.client.amenity.update({ where: { id }, data: { archivedAt: new Date(), published: false } });
    await this.audit.record({ actorId: actorOf(req).id, action: 'amenity.archive', entity: 'amenity', entityId: id, target: row.name, summary: `Archived amenity ${row.name}`, req });
    await this.sync.changed('content');
    return { ok: true };
  }

  private async assertAmenitySlug(slug: string, developmentId: string, exceptId?: string) {
    const clash = await this.prisma.client.amenity.count({ where: { developmentId, slug, ...(exceptId ? { id: { not: exceptId } } : {}) } });
    if (clash) throw new BadRequestException('Another amenity already uses that handle.');
  }
}
