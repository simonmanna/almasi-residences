import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Prisma } from '@avida/db';
import { can, contentPageDef, PERMISSION_LABEL, type Permission } from '@avida/types';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AuditService } from '../../common/audit.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { issuePreviewToken } from '../../common/preview.js';
import { PrismaService } from '../../common/prisma.service.js';
import { PublicSync, type SyncScope } from '../../common/public-sync.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf } from './actor.js';

class PreviewDto {
  @IsOptional() @IsString() @MaxLength(300) @Matches(/^\/[^\s]*$/, { message: 'A preview path starts with /.' }) path?: string;
}

type Action = 'publish' | 'unpublish' | 'archive' | 'restore' | 'delete';

interface EntityDef {
  label: string;
  /** Who may edit it; archiving and restoring need this. */
  edit: Permission;
  /**
   * Who may put it live. Marketing content needs `content.publish` (§49);
   * property facts go live with the right to edit them.
   */
  publish: Permission;
  scope: SyncScope;
  /** Where on the website it appears, for the "view" link. */
  path: (row: Record<string, unknown>) => string;
  title: (row: Record<string, unknown>) => string;
  /** A reason it cannot be archived or deleted, or null. */
  blocked?: (id: string, prisma: PrismaService, action: Action) => Promise<string | null>;
  /** The Prisma delegate name. */
  model: 'amenity' | 'faq' | 'progressUpdate' | 'specification' | 'gallery' | 'tour' | 'media' | 'typology' | 'paymentPlan' | 'floor';
  /** How the row is scoped to the property. */
  scopeWhere: (developmentId: string) => Record<string, unknown>;
  deletable: boolean;
}

const byDev = (developmentId: string) => ({ developmentId });

const ENTITIES: Record<string, EntityDef> = {
  amenity: { label: 'Amenity', model: 'amenity', edit: 'amenity.edit', publish: 'content.publish', scope: 'content', path: () => '/amenities', title: (r) => String(r.name), scopeWhere: byDev, deletable: true },
  faq: { label: 'FAQ', model: 'faq', edit: 'content.edit', publish: 'content.publish', scope: 'content', path: () => '/buying', title: (r) => String(r.question), scopeWhere: byDev, deletable: true },
  progress: { label: 'Progress update', model: 'progressUpdate', edit: 'content.edit', publish: 'content.publish', scope: 'content', path: () => '/progress', title: (r) => String(r.title), scopeWhere: byDev, deletable: true },
  specification: { label: 'Specification', model: 'specification', edit: 'typology.edit', publish: 'typology.edit', scope: 'content', path: () => '/residences', title: (r) => String(r.label), scopeWhere: byDev, deletable: true },
  gallery: { label: 'Gallery', model: 'gallery', edit: 'gallery.edit', publish: 'content.publish', scope: 'media', path: () => '/gallery', title: (r) => String(r.title), scopeWhere: byDev, deletable: true },
  tour: { label: 'Tour', model: 'tour', edit: 'content.edit', publish: 'content.publish', scope: 'presentation', path: (r) => (r.slug === 'building' ? '/tour' : r.slug === 'penthouse' ? '/tour/penthouse' : '/'), title: (r) => String(r.name), scopeWhere: byDev, deletable: false },
  media: {
    label: 'File',
    model: 'media',
    edit: 'media.edit',
    publish: 'content.publish',
    scope: 'media',
    path: () => '/gallery',
    title: (r) => String(r.title ?? 'Untitled file'),
    scopeWhere: byDev,
    deletable: false,
  },
  type: {
    label: 'Residence type',
    model: 'typology',
    edit: 'typology.edit',
    publish: 'typology.edit',
    scope: 'inventory',
    path: () => '/residences',
    title: (r) => String(r.name),
    scopeWhere: byDev,
    deletable: false,
    blocked: async (id, prisma, action) => {
      if (action !== 'archive' && action !== 'unpublish') return null;
      const n = await prisma.client.unit.count({ where: { typologyId: id, archivedAt: null } });
      return n ? `${n} residence${n === 1 ? ' uses' : 's use'} this type. Change their type first.` : null;
    },
  },
  'payment-plan': {
    label: 'Payment plan',
    model: 'paymentPlan',
    edit: 'payment-plan.edit',
    publish: 'payment-plan.edit',
    scope: 'inventory',
    path: () => '/buying',
    title: (r) => String(r.name),
    scopeWhere: byDev,
    deletable: false,
    blocked: async (id, prisma, action) => {
      if (action !== 'archive') return null;
      const plan = await prisma.client.paymentPlan.findUnique({ where: { id }, select: { isDefault: true, _count: { select: { units: true } } } });
      if (plan?.isDefault) return 'The default plan cannot be archived. Make another plan the default first.';
      return plan?._count.units ? `${plan._count.units} residences are on this plan.` : null;
    },
  },
  floor: {
    label: 'Floor',
    model: 'floor',
    edit: 'floor.edit',
    publish: 'floor.edit',
    scope: 'inventory',
    path: () => '/residences',
    title: (r) => String(r.displayName ?? r.label),
    scopeWhere: (developmentId) => ({ building: { developmentId } }),
    deletable: false,
    blocked: async (id, prisma, action) => {
      if (action !== 'archive') return null;
      const n = await prisma.client.unit.count({ where: { floorId: id, archivedAt: null } });
      return n ? `${n} residences are on this floor. Move them first.` : null;
    },
  },
};

type Delegate = {
  findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
  findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
  update: (args: unknown) => Promise<Record<string, unknown>>;
  delete: (args: unknown) => Promise<unknown>;
};

/**
 * §40.2 — safe publishing: draft → preview → publish / unpublish → archive →
 * restore, with who and when recorded. One controller for every publishable
 * entity, so the rules are written once: marketing content needs
 * `content.publish`, a mistake is recoverable from the archive, and nothing is
 * permanently deleted until it has been archived first.
 */
@Controller('admin')
@UseGuards(AdminGuard)
@UseInterceptors(NoStoreInterceptor)
export class PublishingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly audit: AuditService,
    private readonly sync: PublicSync,
  ) {}

  private delegate(def: EntityDef): Delegate {
    return this.prisma.client[def.model] as unknown as Delegate;
  }

  /** Everything waiting for a decision: drafts, unpublished records, the archive. */
  @Get('publishing')
  @RequirePermission('content.view')
  async overview(@Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const actor = actorOf(req);
    const [drafts, archived] = await Promise.all([
      Promise.all(
        Object.entries(ENTITIES).map(async ([key, def]) =>
          (await this.delegate(def).findMany({ where: { ...def.scopeWhere(developmentId), published: false, archivedAt: null }, take: 50 })).map((r) => this.item(key, def, r, actor.role)),
        ),
      ),
      Promise.all(
        Object.entries(ENTITIES).map(async ([key, def]) =>
          (await this.delegate(def).findMany({ where: { ...def.scopeWhere(developmentId), archivedAt: { not: null } }, orderBy: { archivedAt: 'desc' }, take: 100 })).map((r) => this.item(key, def, r, actor.role)),
        ),
      ),
    ]);
    const pages = await this.prisma.client.contentPage.findMany({ where: { developmentId, draftContent: { not: Prisma.AnyNull } }, orderBy: { draftUpdatedAt: 'desc' } });
    const users = new Map((await this.prisma.client.adminUser.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    return {
      pages: pages.map((p) => ({
        key: p.key,
        title: contentPageDef(p.key)?.title ?? p.title,
        draftUpdatedAt: p.draftUpdatedAt,
        draftUpdatedBy: p.draftUpdatedById ? (users.get(p.draftUpdatedById) ?? null) : null,
        changedFields: Object.keys((p.draftContent ?? {}) as Record<string, unknown>).length,
      })),
      drafts: drafts.flat(),
      archived: archived.flat(),
      canPublish: can(actor.role, 'content.publish'),
    };
  }

  private item(key: string, def: EntityDef, r: Record<string, unknown>, role: string) {
    return {
      entity: key,
      entityLabel: def.label,
      id: String(r.id),
      title: def.title(r),
      path: def.path(r),
      archivedAt: r.archivedAt ?? null,
      publishedAt: r.publishedAt ?? null,
      unpublishedAt: r.unpublishedAt ?? null,
      canPublish: can(role, def.publish),
      canEdit: can(role, def.edit),
      deletable: def.deletable,
    };
  }

  @Post('publishing/:entity/:id/:action')
  @HttpCode(200)
  @RequirePermission('content.view')
  async act(@Param('entity') entity: string, @Param('id') id: string, @Param('action') action: string, @Req() req: AdminRequest) {
    const def = ENTITIES[entity];
    if (!def) throw new NotFoundException('That cannot be published.');
    if (!['publish', 'unpublish', 'archive', 'restore'].includes(action)) throw new BadRequestException('Unknown action.');
    const actor = actorOf(req);
    const need = action === 'publish' || action === 'unpublish' ? def.publish : def.edit;
    if (!can(actor.role, need)) throw new ForbiddenException(`Your role does not allow this: ${PERMISSION_LABEL[need].toLowerCase()}.`);

    const developmentId = await this.dev.id();
    const d = this.delegate(def);
    const row = await d.findFirst({ where: { id, ...def.scopeWhere(developmentId) } });
    if (!row) throw new NotFoundException(`No such ${def.label.toLowerCase()}`);
    const reason = await def.blocked?.(id, this.prisma, action as Action);
    if (reason) throw new ConflictException(reason);
    if ((action === 'publish' || action === 'unpublish') && row.archivedAt) throw new ConflictException(`This ${def.label.toLowerCase()} is archived. Restore it first.`);

    const now = new Date();
    const data: Record<string, unknown> =
      action === 'publish'
        ? { published: true, publishedAt: now, publishedById: actor.id, unpublishedAt: null }
        : action === 'unpublish'
          ? { published: false, unpublishedAt: now }
          : action === 'archive'
            ? { archivedAt: now, published: false, unpublishedAt: row.published ? now : row.unpublishedAt }
            : { archivedAt: null };
    await d.update({ where: { id }, data });
    const title = def.title(row);
    const verb = { publish: 'Published', unpublish: 'Unpublished', archive: 'Archived', restore: 'Restored' }[action as 'publish'];
    await this.audit.record({ actorId: actor.id, action: `${entity}.${action}`, entity, entityId: id, target: title, summary: `${verb} ${def.label.toLowerCase()} “${title}”${action === 'restore' ? ' (still unpublished — publish it to show it)' : ''}`, req });
    await this.sync.changed(def.scope);
    return { ok: true, [action === 'publish' || action === 'unpublish' ? 'published' : 'archived']: action === 'publish' || action === 'archive' };
  }

  /** Permanent deletion, only from the archive. */
  @Delete('publishing/:entity/:id')
  @RequirePermission('content.view')
  async deleteForever(@Param('entity') entity: string, @Param('id') id: string, @Req() req: AdminRequest) {
    const def = ENTITIES[entity];
    if (!def) throw new NotFoundException('That cannot be deleted here.');
    const actor = actorOf(req);
    if (!can(actor.role, def.edit)) throw new ForbiddenException(`Your role does not allow this: ${PERMISSION_LABEL[def.edit].toLowerCase()}.`);
    if (!def.deletable) throw new ConflictException(`A ${def.label.toLowerCase()} is deleted from its own screen, where what depends on it is checked.`);
    const developmentId = await this.dev.id();
    const d = this.delegate(def);
    const row = await d.findFirst({ where: { id, ...def.scopeWhere(developmentId) } });
    if (!row) throw new NotFoundException(`No such ${def.label.toLowerCase()}`);
    if (!row.archivedAt) throw new ConflictException('Archive it first. Permanent deletion is only possible from the archive.');
    if (def.model === 'amenity') await this.prisma.client.media.updateMany({ where: { amenityId: id }, data: { amenityId: null, isCover: false } });
    await d.delete({ where: { id } });
    const title = def.title(row);
    await this.audit.record({ actorId: actor.id, action: `${entity}.delete`, entity, entityId: id, target: title, summary: `Permanently deleted ${def.label.toLowerCase()} “${title}”`, req });
    return { ok: true };
  }

  // ─── Page drafts ───────────────────────────────────────────────────────

  @Post('pages/:key/publish')
  @HttpCode(200)
  @RequirePermission('content.publish')
  async publishPage(@Param('key') key: string, @Req() req: AdminRequest) {
    const def = contentPageDef(key);
    if (!def) throw new NotFoundException('No such page');
    const developmentId = await this.dev.id();
    const row = await this.prisma.client.contentPage.findUnique({ where: { developmentId_key: { developmentId, key } } });
    if (!row?.draftContent) throw new ConflictException('There is no draft to publish.');
    const before = (row.content ?? {}) as Record<string, unknown>;
    const draft = row.draftContent as Record<string, unknown>;
    const changed = Object.keys(draft).filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(draft[k] ?? null));
    await this.prisma.client.contentPage.update({
      where: { id: row.id },
      data: { content: { ...before, ...draft } as Prisma.InputJsonValue, draftContent: Prisma.DbNull, draftUpdatedAt: null, draftUpdatedById: null, published: true, publishedAt: new Date(), publishedById: actorOf(req).id, updatedById: actorOf(req).id },
    });
    await this.audit.record({
      actorId: actorOf(req).id,
      action: 'content.publish',
      entity: 'page',
      entityId: key,
      target: def.title,
      summary: `Published ${def.title}: ${changed.map((k) => def.fields.find((f) => f.key === k)?.label.toLowerCase() ?? k).join(', ') || 'no visible change'}`,
      before: Object.fromEntries(changed.map((k) => [k, before[k] ?? null])),
      after: Object.fromEntries(changed.map((k) => [k, draft[k] ?? null])),
      req,
    });
    await this.sync.changed('content');
    return { ok: true, changed };
  }

  @Post('pages/:key/discard')
  @HttpCode(200)
  @RequirePermission('content.edit')
  async discardPage(@Param('key') key: string, @Req() req: AdminRequest) {
    const def = contentPageDef(key);
    if (!def) throw new NotFoundException('No such page');
    const developmentId = await this.dev.id();
    await this.prisma.client.contentPage.updateMany({ where: { developmentId, key }, data: { draftContent: Prisma.DbNull, draftUpdatedAt: null, draftUpdatedById: null } });
    await this.audit.record({ actorId: actorOf(req).id, action: 'content.discard', entity: 'page', entityId: key, target: def.title, summary: `Discarded the draft of ${def.title}`, req });
    return { ok: true };
  }

  // ─── Preview ───────────────────────────────────────────────────────────

  /**
   * A signed, one-hour preview link. The website verifies the token with the
   * API and enters Draft Mode, where every read carries it and drafts show.
   */
  @Post('preview')
  @HttpCode(200)
  @RequirePermission('content.view')
  async preview(@Body() dto: PreviewDto, @Req() req: AdminRequest) {
    const { token, expiresAt } = issuePreviewToken(actorOf(req).id);
    const site = (process.env.WEB_PUBLIC_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
    const path = dto.path ?? '/';
    return { url: `${site}/api/draft?token=${encodeURIComponent(token)}&path=${encodeURIComponent(path)}`, expiresAt };
  }
}
