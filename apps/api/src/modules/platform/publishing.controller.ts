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
import { IsDateString, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
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

class ScheduleDto {
  @IsDateString() runAt!: string;
  @IsIn(['publish', 'unpublish']) action!: 'publish' | 'unpublish';
}

class ApprovalDto {
  @IsIn(['publish', 'unpublish']) action!: 'publish' | 'unpublish';
  @IsOptional() @IsString() @MaxLength(500) note?: string;
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
    const [pages, schedules, approvals, userRows] = await Promise.all([
      this.prisma.client.contentPage.findMany({ where: { developmentId, draftContent: { not: Prisma.AnyNull } }, orderBy: { draftUpdatedAt: 'desc' } }),
      this.prisma.client.publicationSchedule.findMany({ where: { developmentId, status: 'PENDING' }, orderBy: { runAt: 'asc' } }),
      this.prisma.client.publicationApproval.findMany({ where: { developmentId, status: 'PENDING' }, orderBy: { createdAt: 'asc' } }),
      this.prisma.client.adminUser.findMany({ select: { id: true, name: true } }),
    ]);
    const users = new Map(userRows.map((u) => [u.id, u.name]));
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
      schedules: schedules.map((s) => ({ ...s, requestedBy: users.get(s.requestedById) ?? 'Unknown user' })),
      approvals: approvals.map((a) => ({ ...a, requestedBy: users.get(a.requestedById) ?? 'Unknown user' })),
      canPublish: can(actor.role, 'content.publish'),
    };
  }

  @Post('publishing/:entity/:id/schedule')
  @HttpCode(201)
  @RequirePermission('content.publish')
  async schedule(@Param('entity') entity: string, @Param('id') id: string, @Body() dto: ScheduleDto, @Req() req: AdminRequest) {
    const def = ENTITIES[entity];
    if (!def && entity !== 'page') throw new NotFoundException('That cannot be scheduled.');
    const actor = actorOf(req);
    const permission = def?.publish ?? 'content.publish';
    if (!can(actor.role, permission)) throw new ForbiddenException(`Your role does not allow this: ${PERMISSION_LABEL[permission].toLowerCase()}.`);
    const runAt = new Date(dto.runAt);
    if (runAt.getTime() <= Date.now()) throw new BadRequestException('Choose a future time.');
    const developmentId = await this.dev.id();
    const row = def
      ? await this.delegate(def).findFirst({ where: { id, ...def.scopeWhere(developmentId) } })
      : await this.prisma.client.contentPage.findUnique({ where: { developmentId_key: { developmentId, key: id } } });
    if (!row) throw new NotFoundException('No such publishable item.');
    const item = await this.prisma.client.publicationSchedule.create({ data: { developmentId, entity, entityId: id, action: dto.action, runAt, requestedById: actor.id } });
    await this.audit.record({ actorId: actor.id, action: `${entity}.schedule`, entity, entityId: id, target: def ? def.title(row) : id, summary: `Scheduled ${dto.action} for ${runAt.toISOString()}`, req });
    return item;
  }

  @Delete('publishing/schedules/:id')
  @RequirePermission('content.publish')
  async cancelSchedule(@Param('id') id: string, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const changed = await this.prisma.client.publicationSchedule.updateMany({ where: { id, developmentId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
    if (!changed.count) throw new NotFoundException('No pending schedule with that id.');
    await this.audit.record({ actorId: actorOf(req).id, action: 'publication.schedule.cancel', entity: 'publication-schedule', entityId: id, summary: 'Cancelled scheduled publication', req });
    return { ok: true };
  }

  @Post('publishing/:entity/:id/request')
  @HttpCode(201)
  @RequirePermission('content.view')
  async requestApproval(@Param('entity') entity: string, @Param('id') id: string, @Body() dto: ApprovalDto, @Req() req: AdminRequest) {
    const def = ENTITIES[entity];
    if (!def && entity !== 'page') throw new NotFoundException('That cannot be submitted for approval.');
    const actor = actorOf(req);
    const permission = def?.edit ?? 'content.edit';
    if (!can(actor.role, permission)) throw new ForbiddenException(`Your role does not allow this: ${PERMISSION_LABEL[permission].toLowerCase()}.`);
    const developmentId = await this.dev.id();
    const row = def
      ? await this.delegate(def).findFirst({ where: { id, ...def.scopeWhere(developmentId) } })
      : await this.prisma.client.contentPage.findUnique({ where: { developmentId_key: { developmentId, key: id } } });
    if (!row) throw new NotFoundException('No such publishable item.');
    const pending = await this.prisma.client.publicationApproval.findFirst({ where: { developmentId, entity, entityId: id, status: 'PENDING' } });
    if (pending) throw new ConflictException('This item is already awaiting approval.');
    return this.prisma.client.publicationApproval.create({ data: { developmentId, entity, entityId: id, action: dto.action, note: dto.note, requestedById: actor.id } });
  }

  @Post('publishing/approvals/:id/:decision')
  @HttpCode(200)
  @RequirePermission('content.publish')
  async decideApproval(@Param('id') id: string, @Param('decision') decision: string, @Req() req: AdminRequest) {
    if (!['approve', 'reject'].includes(decision)) throw new BadRequestException('Unknown decision.');
    const developmentId = await this.dev.id();
    const approval = await this.prisma.client.publicationApproval.findFirst({ where: { id, developmentId, status: 'PENDING' } });
    if (!approval) throw new NotFoundException('No pending approval with that id.');
    if (decision === 'approve') {
      if (approval.entity === 'page') await this.publishPage(approval.entityId, req);
      else await this.act(approval.entity, approval.entityId, approval.action, req);
    }
    await this.prisma.client.publicationApproval.update({ where: { id }, data: { status: decision === 'approve' ? 'APPROVED' : 'REJECTED', decidedById: actorOf(req).id, decidedAt: new Date() } });
    return { ok: true };
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
    await this.prisma.client.$transaction(async (tx) => {
      await tx.contentRevision.create({ data: { developmentId, pageKey: key, content: (row.content ?? {}) as Prisma.InputJsonValue, createdById: actorOf(req).id } });
      await tx.contentPage.update({
        where: { id: row.id },
        data: { content: { ...before, ...draft } as Prisma.InputJsonValue, draftContent: Prisma.DbNull, draftUpdatedAt: null, draftUpdatedById: null, published: true, publishedAt: new Date(), publishedById: actorOf(req).id, updatedById: actorOf(req).id },
      });
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

  @Get('pages/:key/revisions')
  @RequirePermission('content.view')
  async revisions(@Param('key') key: string) {
    return this.prisma.client.contentRevision.findMany({ where: { developmentId: await this.dev.id(), pageKey: key }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, createdAt: true, createdById: true } });
  }

  /** Rollback is deliberately restored as a draft, so it still passes preview and approval. */
  @Post('pages/:key/revisions/:revisionId/restore')
  @HttpCode(200)
  @RequirePermission('content.edit')
  async restoreRevision(@Param('key') key: string, @Param('revisionId') revisionId: string, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const revision = await this.prisma.client.contentRevision.findFirst({ where: { id: revisionId, developmentId, pageKey: key } });
    if (!revision) throw new NotFoundException('No such revision.');
    await this.prisma.client.contentPage.update({ where: { developmentId_key: { developmentId, key } }, data: { draftContent: revision.content as Prisma.InputJsonValue, draftUpdatedAt: new Date(), draftUpdatedById: actorOf(req).id } });
    await this.audit.record({ actorId: actorOf(req).id, action: 'content.rollback', entity: 'page', entityId: key, summary: `Restored revision ${revisionId} as a draft`, req });
    return { ok: true };
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
