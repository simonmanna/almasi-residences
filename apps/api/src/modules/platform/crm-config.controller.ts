import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { DocumentKind, EnquiryStatus, LeadSource, Prisma } from '@avida/db';
import { can, DOCUMENT_KIND_LABEL, scoringRules, SCORING_RULES, type ScoringRuleSetting } from '@avida/types';
import { AuditService } from '../../common/audit.service.js';
import { CrmService } from '../../common/crm.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { PrismaService } from '../../common/prisma.service.js';
import { StorageService } from '../../common/storage.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf, assertCan } from './actor.js';
import { CampaignDto, CreateCampaignDto, CreateStageDto, CrmSettingsDto, ReorderStagesDto, SavedViewDto, StageDto } from './crm.dto.js';

const CLOSED: EnquiryStatus[] = ['SOLD', 'LOST', 'DISQUALIFIED', 'SPAM'];
const DOC_KINDS = Object.keys(DOCUMENT_KIND_LABEL);

/**
 * The CRM's configuration and personal surfaces: the pipeline columns and
 * scoring and assignment rules (`crm.configure`), campaigns, each person's
 * saved views and notification inbox, and the documents on a lead.
 */
@Controller('admin/crm')
@UseGuards(AdminGuard)
@RequirePermission('enquiry.view')
@UseInterceptors(NoStoreInterceptor)
export class CrmConfigController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly audit: AuditService,
    private readonly crm: CrmService,
    private readonly storage: StorageService,
  ) {}

  // ─── Pipeline stages ───────────────────────────────────────────────────

  @Get('stages')
  async stages() {
    const developmentId = await this.dev.id();
    await this.crm.ensureStages(developmentId);
    const [stages, counts] = await Promise.all([
      this.crm.stages(developmentId),
      this.prisma.client.enquiry.groupBy({ by: ['stageId'], where: { developmentId, archivedAt: null }, _count: true }),
    ]);
    return stages.map((s) => ({ ...s, leadCount: counts.find((c) => c.stageId === s.id)?._count ?? 0 }));
  }

  @Post('stages')
  @RequirePermission('crm.configure')
  async createStage(@Body() dto: CreateStageDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    await this.crm.ensureStages(developmentId);
    const last = await this.prisma.client.pipelineStage.findFirst({ where: { developmentId }, orderBy: { position: 'desc' }, select: { position: true } });
    const stage = await this.prisma.client.pipelineStage.create({ data: { developmentId, label: dto.label.trim(), category: dto.category as EnquiryStatus, color: dto.color ?? 'sky', probability: dto.probability ?? 0, active: dto.active ?? true, position: (last?.position ?? -1) + 1 } });
    await this.audit.record({ actorId: actorOf(req).id, action: 'crm.stage.create', entity: 'pipeline', entityId: stage.id, target: stage.label, summary: `Added pipeline stage “${stage.label}”`, after: stage, req });
    return stage;
  }

  @Patch('stages/:id')
  @RequirePermission('crm.configure')
  async updateStage(@Param('id') id: string, @Body() dto: StageDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const before = await this.prisma.client.pipelineStage.findFirst({ where: { id, developmentId } });
    if (!before) throw new NotFoundException('No such stage');
    const category = (dto.category as EnquiryStatus | undefined) ?? before.category;
    if (dto.category && dto.category !== before.category && (await this.prisma.client.enquiry.count({ where: { stageId: id } }))) {
      throw new ConflictException('Leads sit in this stage. Move them out before changing what it means, or add a new stage instead.');
    }
    if (dto.active === false && before.active && !(await this.prisma.client.pipelineStage.count({ where: { developmentId, category, active: true, id: { not: id } } })) && category !== 'SPAM') {
      throw new ConflictException('This is the only active stage for its category. Add another before switching it off.');
    }
    const after = await this.prisma.client.pipelineStage.update({
      where: { id },
      data: {
        ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
        ...(dto.category !== undefined ? { category } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.probability !== undefined ? { probability: dto.probability } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
    // Leads in a stage that was switched off move to the category's other active column.
    if (dto.active === false && before.active) {
      const fallback = await this.prisma.client.pipelineStage.findFirst({ where: { developmentId, category, active: true }, orderBy: { position: 'asc' } });
      if (fallback) await this.prisma.client.enquiry.updateMany({ where: { stageId: id }, data: { stageId: fallback.id } });
    }
    await this.audit.record({ actorId: actorOf(req).id, action: 'crm.stage.update', entity: 'pipeline', entityId: id, target: after.label, summary: `Changed pipeline stage “${before.label}”`, before, after, req });
    return after;
  }

  @Post('stages/reorder')
  @HttpCode(200)
  @RequirePermission('crm.configure')
  async reorder(@Body() dto: ReorderStagesDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const stages = await this.crm.stages(developmentId);
    if (dto.ids.length !== stages.length || !stages.every((s) => dto.ids.includes(s.id))) throw new BadRequestException('Send every stage, once, in the new order.');
    await this.prisma.client.$transaction(dto.ids.map((id, position) => this.prisma.client.pipelineStage.update({ where: { id }, data: { position } })));
    await this.audit.record({ actorId: actorOf(req).id, action: 'crm.stage.reorder', entity: 'pipeline', summary: 'Reordered the pipeline', after: { ids: dto.ids }, req });
    return { ok: true };
  }

  @Delete('stages/:id')
  @RequirePermission('crm.configure')
  async deleteStage(@Param('id') id: string, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const stage = await this.prisma.client.pipelineStage.findFirst({ where: { id, developmentId } });
    if (!stage) throw new NotFoundException('No such stage');
    const fallback = await this.prisma.client.pipelineStage.findFirst({ where: { developmentId, category: stage.category, id: { not: id } }, orderBy: [{ active: 'desc' }, { position: 'asc' }] });
    if (!fallback) throw new ConflictException('This is the only stage for its category, so it cannot be deleted. Switch it off or rename it instead.');
    await this.prisma.client.$transaction([
      this.prisma.client.enquiry.updateMany({ where: { stageId: id }, data: { stageId: fallback.id } }),
      this.prisma.client.pipelineStage.delete({ where: { id } }),
    ]);
    await this.audit.record({ actorId: actorOf(req).id, action: 'crm.stage.delete', entity: 'pipeline', entityId: id, target: stage.label, summary: `Deleted pipeline stage “${stage.label}”; its leads moved to “${fallback.label}”`, before: stage, req });
    return { ok: true };
  }

  // ─── Scoring & assignment ──────────────────────────────────────────────

  @Get('settings')
  async settings() {
    const developmentId = await this.dev.id();
    const s = await this.crm.settings(developmentId);
    return { ...s, rules: scoringRules(s.scoringRules as ScoringRuleSetting[] | null), defaults: SCORING_RULES };
  }

  @Put('settings')
  @RequirePermission('crm.configure')
  async saveSettings(@Body() dto: CrmSettingsDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const before = await this.crm.settings(developmentId);
    const hot = dto.hotThreshold ?? before.hotThreshold;
    const warm = dto.warmThreshold ?? before.warmThreshold;
    if (warm >= hot) throw new BadRequestException('The warm threshold must be below the hot one.');
    if (dto.assignmentPool?.length) {
      const users = await this.prisma.client.adminUser.findMany({ where: { id: { in: dto.assignmentPool }, active: true }, select: { role: true } });
      if (users.length !== dto.assignmentPool.length || users.some((u) => !can(u.role, 'enquiry.edit'))) throw new BadRequestException('Everyone in the rotation must be an active user who can work leads.');
    }
    const after = await this.prisma.client.crmSettings.update({
      where: { developmentId },
      data: {
        ...(dto.assignmentMode !== undefined ? { assignmentMode: dto.assignmentMode as Prisma.CrmSettingsUpdateInput['assignmentMode'] } : {}),
        ...(dto.assignmentPool !== undefined ? { assignmentPool: dto.assignmentPool } : {}),
        ...(dto.scoringRules !== undefined ? { scoringRules: dto.scoringRules as unknown as Prisma.InputJsonValue } : {}),
        hotThreshold: hot,
        warmThreshold: warm,
      },
    });
    await this.audit.record({ actorId: actorOf(req).id, action: 'crm.settings', entity: 'crm', summary: 'Changed CRM scoring or assignment rules', before, after, req });
    // Scores follow the new rules: recompute the open leads now, in the background of this request.
    if (dto.scoringRules !== undefined) {
      const open = await this.prisma.client.enquiry.findMany({ where: { developmentId, archivedAt: null, status: { notIn: CLOSED } }, select: { id: true }, take: 2000 });
      for (const l of open) await this.crm.rescore(l.id);
    }
    return this.settings();
  }

  // ─── Campaigns ─────────────────────────────────────────────────────────

  @Get('campaigns')
  async campaigns() {
    const developmentId = await this.dev.id();
    const [rows, stats] = await Promise.all([
      this.prisma.client.campaign.findMany({ where: { developmentId }, orderBy: [{ active: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.client.enquiry.groupBy({ by: ['campaignId', 'status'], where: { developmentId, campaignId: { not: null }, status: { not: 'SPAM' } }, _count: true }),
    ]);
    return rows.map((c) => {
      const mine = stats.filter((s) => s.campaignId === c.id);
      const leads = mine.reduce((a, s) => a + s._count, 0);
      const won = mine.filter((s) => s.status === 'SOLD').reduce((a, s) => a + s._count, 0);
      return { ...c, leads, won, open: mine.filter((s) => !CLOSED.includes(s.status)).reduce((a, s) => a + s._count, 0), costPerLeadMinor: c.budgetMinor && leads ? Math.round(c.budgetMinor / leads) : null };
    });
  }

  @Post('campaigns')
  @RequirePermission('campaign.edit')
  async createCampaign(@Body() dto: CreateCampaignDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    if (await this.prisma.client.campaign.count({ where: { developmentId, name: dto.name.trim() } })) throw new ConflictException('A campaign with that name already exists.');
    const c = await this.prisma.client.campaign.create({ data: { developmentId, ...this.campaignData(dto), name: dto.name.trim() } });
    await this.audit.record({ actorId: actorOf(req).id, action: 'campaign.create', entity: 'campaign', entityId: c.id, target: c.name, summary: `Created campaign ${c.name}`, req });
    return c;
  }

  @Patch('campaigns/:id')
  @RequirePermission('campaign.edit')
  async updateCampaign(@Param('id') id: string, @Body() dto: CampaignDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const before = await this.prisma.client.campaign.findFirst({ where: { id, developmentId } });
    if (!before) throw new NotFoundException('No such campaign');
    const c = await this.prisma.client.campaign.update({ where: { id }, data: this.campaignData(dto) });
    await this.audit.record({ actorId: actorOf(req).id, action: 'campaign.update', entity: 'campaign', entityId: id, target: c.name, summary: `Changed campaign ${c.name}`, before, after: c, req });
    return c;
  }

  private campaignData(dto: CampaignDto): Partial<Omit<Prisma.CampaignUncheckedCreateInput, 'developmentId'>> {
    if (dto.startsAt && dto.endsAt && new Date(dto.endsAt) < new Date(dto.startsAt)) throw new BadRequestException('The campaign ends before it starts.');
    return {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.channel !== undefined ? { channel: dto.channel as LeadSource } : {}),
      ...(dto.utmCampaign !== undefined ? { utmCampaign: dto.utmCampaign?.trim() || null } : {}),
      ...(dto.startsAt !== undefined ? { startsAt: dto.startsAt ? new Date(dto.startsAt) : null } : {}),
      ...(dto.endsAt !== undefined ? { endsAt: dto.endsAt ? new Date(dto.endsAt) : null } : {}),
      ...(dto.budgetMinor !== undefined ? { budgetMinor: dto.budgetMinor } : {}),
      ...(dto.active !== undefined ? { active: dto.active } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
    };
  }

  // ─── Saved views ───────────────────────────────────────────────────────

  @Get('views')
  async views(@Req() req: AdminRequest, @Query('scope') scope?: string) {
    const me = actorOf(req).id;
    return this.prisma.client.savedView.findMany({ where: { ...(scope ? { scope } : {}), OR: [{ userId: me }, { shared: true }] }, orderBy: { createdAt: 'asc' }, include: { user: { select: { name: true } } } });
  }

  @Post('views')
  async saveView(@Body() dto: SavedViewDto, @Req() req: AdminRequest) {
    const clean = Object.fromEntries(Object.entries(dto.filters).filter(([k, v]) => typeof v === 'string' && k.length <= 40 && v.length <= 200 && k !== 'page' && k !== 'open').slice(0, 30));
    return this.prisma.client.savedView.create({ data: { userId: actorOf(req).id, scope: dto.scope, name: dto.name.trim(), filters: clean, shared: Boolean(dto.shared) && can(actorOf(req).role, 'enquiry.view-all') } });
  }

  @Delete('views/:id')
  async deleteView(@Param('id') id: string, @Req() req: AdminRequest) {
    const { count } = await this.prisma.client.savedView.deleteMany({ where: { id, userId: actorOf(req).id } });
    if (!count) throw new NotFoundException('No such saved view (only its owner can delete it).');
    return { ok: true };
  }

  // ─── Notifications (the bell) ──────────────────────────────────────────

  /** The inbox. Follow-ups that are due or overdue are raised here, once per due time. */
  @Get('inbox')
  async inbox(@Req() req: AdminRequest) {
    const me = actorOf(req).id;
    const developmentId = await this.dev.id();
    const soon = new Date(Date.now() + 60 * 60_000);
    const due = await this.prisma.client.leadTask.findMany({ where: { developmentId, assignedToId: me, status: 'OPEN', dueAt: { lte: soon } }, select: { id: true, title: true, dueAt: true, enquiryId: true, enquiry: { select: { name: true } } }, take: 50 });
    const now = Date.now();
    for (const t of due) {
      const overdue = t.dueAt!.getTime() < now;
      await this.crm.notify([me], {
        kind: overdue ? 'task.overdue' : 'task.due',
        title: `${overdue ? 'Overdue' : 'Due soon'}: ${t.title}`,
        body: t.enquiry ? t.enquiry.name : null,
        link: t.enquiryId ? `/crm/leads/${t.enquiryId}` : '/crm/tasks',
        enquiryId: t.enquiryId,
        dedupeKey: `task-${overdue ? 'overdue' : 'due'}:${t.id}:${t.dueAt!.getTime()}`,
      });
    }
    const [items, unread] = await Promise.all([
      this.prisma.client.adminNotification.findMany({ where: { userId: me }, orderBy: { createdAt: 'desc' }, take: 40 }),
      this.prisma.client.adminNotification.count({ where: { userId: me, readAt: null } }),
    ]);
    return { items, unread };
  }

  @Post('inbox/read')
  @HttpCode(200)
  async read(@Req() req: AdminRequest, @Body() body: { ids?: string[] }) {
    const ids = Array.isArray(body?.ids) ? body.ids.filter((x): x is string => typeof x === 'string').slice(0, 200) : null;
    await this.prisma.client.adminNotification.updateMany({ where: { userId: actorOf(req).id, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
    return { ok: true };
  }

  // ─── Documents ─────────────────────────────────────────────────────────

  /** Upload a file to a lead (multipart: file, kind, name, dealId, sent). */
  @Post('leads/:id/documents')
  @RequirePermission('crm.documents')
  async upload(@Param('id') id: string, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const developmentId = await this.dev.id();
    const lead = await this.prisma.client.enquiry.findFirst({ where: { AND: [{ id, developmentId, archivedAt: null }, this.crm.leadScope(actor)] }, select: { id: true, name: true } });
    if (!lead) throw new NotFoundException('No such lead, or it belongs to another agent.');
    if (!req.isMultipart()) throw new BadRequestException('Send the file as multipart/form-data.');
    const fields: Record<string, string> = {};
    let file: { buffer: Buffer; mimetype: string; filename: string } | null = null;
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        if (file) throw new BadRequestException('Send one file at a time.');
        file = { buffer: await part.toBuffer(), mimetype: part.mimetype, filename: part.filename };
      } else fields[part.fieldname] = String(part.value ?? '');
    }
    if (!file) throw new BadRequestException('Choose a file to upload.');
    const kind = (DOC_KINDS.includes(fields.kind ?? '') ? fields.kind : 'OTHER') as DocumentKind;
    if (fields.dealId && !(await this.prisma.client.deal.count({ where: { id: fields.dealId, enquiryId: id } }))) throw new BadRequestException('That deal is not on this lead.');
    const stored = await this.storage.store(file.buffer, file.mimetype);
    const name = (fields.name?.trim() || file.filename || DOCUMENT_KIND_LABEL[kind as keyof typeof DOCUMENT_KIND_LABEL]).slice(0, 160);
    const sent = fields.sent === 'true';
    const doc = await this.prisma.client.$transaction(async (tx) => {
      const d = await tx.leadDocument.create({ data: { developmentId, enquiryId: id, dealId: fields.dealId || null, kind, name, storageKey: stored.storageKey, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes, sentAt: sent ? new Date() : null, uploadedById: actor.id } });
      await this.crm.logActivity(tx, id, 'DOCUMENT', `${sent ? 'Sent' : 'Added'} ${DOCUMENT_KIND_LABEL[kind as keyof typeof DOCUMENT_KIND_LABEL].toLowerCase()}: ${name}`, actor.id, { meta: { documentId: d.id }, direction: sent ? 'OUT' : null });
      return d;
    });
    await this.audit.record({ actorId: actor.id, action: 'crm.document.upload', entity: 'enquiry', entityId: id, target: lead.name, summary: `Added ${DOCUMENT_KIND_LABEL[kind as keyof typeof DOCUMENT_KIND_LABEL].toLowerCase()} “${name}” to ${lead.name}`, req });
    const { storageKey, ...rest } = doc;
    return { ...rest, hasFile: Boolean(storageKey) };
  }

  /** Streams a document to someone allowed to see the lead. Never a public URL. */
  @Get('documents/:id/file')
  @RequirePermission('crm.documents')
  async file(@Param('id') id: string, @Req() req: AdminRequest, @Res() reply: FastifyReply) {
    const doc = await this.document(id, req);
    if (!doc.storageKey) throw new NotFoundException('This document has no file.');
    const bytes = await this.storage.read(doc.storageKey);
    if (!bytes) throw new NotFoundException('The file is missing from storage.');
    await this.audit.record({ actorId: actorOf(req).id, action: 'crm.document.download', entity: 'enquiry', entityId: doc.enquiryId ?? undefined, target: doc.name, summary: `Opened document “${doc.name}”`, req });
    const safe = doc.name.replace(/[^\w .-]+/g, '_');
    return reply
      .header('Content-Type', doc.mimeType ?? 'application/octet-stream')
      .header('Content-Disposition', `inline; filename="${safe}"`)
      .header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox")
      .send(bytes);
  }

  @Delete('documents/:id')
  @RequirePermission('crm.documents')
  async archiveDocument(@Param('id') id: string, @Req() req: AdminRequest) {
    const doc = await this.document(id, req);
    assertCan(actorOf(req), 'enquiry.edit');
    await this.prisma.client.leadDocument.update({ where: { id }, data: { archivedAt: new Date() } });
    if (doc.enquiryId) await this.crm.logActivity(this.prisma.client, doc.enquiryId, 'DOCUMENT', `Removed document: ${doc.name}`, actorOf(req).id);
    await this.audit.record({ actorId: actorOf(req).id, action: 'crm.document.remove', entity: 'enquiry', entityId: doc.enquiryId ?? undefined, target: doc.name, summary: `Removed document “${doc.name}”`, req });
    return { ok: true };
  }

  private async document(id: string, req: AdminRequest) {
    const actor = actorOf(req);
    const doc = await this.prisma.client.leadDocument.findFirst({ where: { id, developmentId: await this.dev.id(), archivedAt: null, OR: [{ enquiry: this.crm.leadScope(actor) }, { enquiryId: null }] } });
    if (!doc) throw new NotFoundException('No such document');
    return doc;
  }
}
