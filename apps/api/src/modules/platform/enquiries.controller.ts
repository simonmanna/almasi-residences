import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Header,
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
import { parsePhoneNumberWithError } from 'libphonenumber-js';
import type { EnquiryStatus, LeadNoteKind, LostReason, Prisma } from '@avida/db';
import {
  can,
  FIRST_RESPONSE_HOURS,
  isLeadOverdue,
  LEAD_NOTE_LABEL,
  LEAD_SOURCE_LABEL,
  LOST_REASON_LABEL,
  STAGE_LABEL,
  temperatureFor,
  type LeadSourceValue,
  type LostReasonValue,
} from '@avida/types';
import { AccessService } from '../../common/access.service.js';
import { AuditService } from '../../common/audit.service.js';
import { CrmService, unitCard, type CrmActor } from '../../common/crm.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { pageOf, paged } from '../../common/http.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { PrismaService } from '../../common/prisma.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf, assertCan, type Actor } from './actor.js';
import { BulkLeadDto, CreateLeadDto, DuplicateCheckDto, LeadNoteDto, MergeLeadDto, PinNoteDto, UpdateLeadDto } from './crm.dto.js';

/** §5.9 — an enquiry's retention window moves forward whenever it is worked. */
function nextPurge(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + 24);
  return d;
}

const CLOSED: EnquiryStatus[] = ['SOLD', 'LOST', 'DISQUALIFIED', 'SPAM'];
const OPEN_DEALS = ['NEGOTIATION', 'RESERVED', 'CONTRACT'] as const;
const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

const listInclude = {
  units: { include: { unit: { select: unitCard } } },
  primaryUnit: { select: unitCard },
  typology: { select: { id: true, name: true } },
  stage: { select: { id: true, label: true, color: true, category: true } },
  buyer: { select: { id: true, fullName: true } },
  assignedTo: { select: { id: true, name: true } },
  campaign: { select: { id: true, name: true } },
  viewings: { where: { status: { in: ['REQUESTED', 'SCHEDULED', 'CONFIRMED', 'RESCHEDULED'] } }, select: { id: true, status: true, scheduledAt: true, requestedDate: true }, take: 1, orderBy: { createdAt: 'desc' } },
  deals: { where: { status: { in: ['NEGOTIATION', 'RESERVED', 'CONTRACT', 'SOLD'] } }, select: { id: true, status: true, agreedPriceMinor: true, listPriceMinor: true } },
  tasks: { where: { status: 'OPEN' }, select: { id: true, title: true, dueAt: true, type: true }, orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }], take: 1 },
  _count: { select: { notes: true, tasks: { where: { status: 'OPEN' } } } },
} satisfies Prisma.EnquiryInclude;

type ListRow = Prisma.EnquiryGetPayload<{ include: typeof listInclude }>;

/**
 * §40.3 — the lead desk, now a CRM: every lead (from the website, a call, a
 * walk-in) worked through a configurable pipeline with an owner, qualifying
 * facts, a transparent score, tasks, a history of every touch, and the
 * viewings, deals and reservations it led to.
 *
 * Agents see their own leads and the unassigned pool; managers see all
 * (the data scope of `enquiry.view` / `enquiry.edit`). Every rule is enforced here, never by the admin UI.
 */
@Controller('admin/enquiries')
@UseGuards(AdminGuard)
@RequirePermission('enquiry.view')
@UseInterceptors(NoStoreInterceptor)
export class EnquiriesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly audit: AuditService,
    private readonly crm: CrmService,
    private readonly access: AccessService,
  ) {}

  private async scope(actor: CrmActor, archived = false): Promise<Prisma.EnquiryWhereInput> {
    const developmentId = await this.dev.id();
    await this.crm.ensureStages(developmentId);
    return { AND: [{ developmentId, archivedAt: archived ? { not: null } : null }, this.crm.leadScope(actor)] };
  }

  private overdueWhere(now = new Date()): Prisma.EnquiryWhereInput {
    return {
      status: { notIn: [...CLOSED, 'ON_HOLD'] },
      OR: [{ followUpAt: { lt: now } }, { status: 'NEW', contactedAt: null, createdAt: { lt: new Date(now.getTime() - FIRST_RESPONSE_HOURS * 3_600_000) } }],
    };
  }

  /** Every list filter, shared by the table, the board and the export. */
  private filters(q: Record<string, string | undefined>, me: string): Prisma.EnquiryWhereInput[] {
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const csv = (v?: string) => (v ? v.split(',').filter(Boolean) : []);
    const num = (v?: string) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);
    const date = (v?: string) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v) : undefined);
    const f: Prisma.EnquiryWhereInput[] = [];
    const view = q.view ?? '';
    if (q.status) f.push({ status: { in: csv(q.status) as EnquiryStatus[] } });
    else if (!q.stageId && view !== 'closed') f.push({ status: { not: 'SPAM' } });
    if (q.stageId) f.push({ stageId: { in: csv(q.stageId) } });
    if (view === 'mine') f.push({ assignedToId: me, status: { notIn: CLOSED } });
    if (view === 'new') f.push({ status: 'NEW' });
    if (view === 'unassigned') f.push({ assignedToId: null, status: { notIn: CLOSED } });
    if (view === 'open') f.push({ status: { notIn: CLOSED } });
    if (view === 'closed') f.push({ status: { in: CLOSED } });
    if (view === 'overdue' || q.overdue === 'true') f.push(this.overdueWhere(now));
    if (q.hot === 'true') f.push({ OR: [{ temperature: 'HOT' }, { temperature: null, score: { gte: 70 } }] });
    if (q.assignedTo === 'none') f.push({ assignedToId: null });
    else if (q.assignedTo === 'me') f.push({ assignedToId: me });
    else if (q.assignedTo) f.push({ assignedToId: q.assignedTo });
    if (q.unitId) f.push({ OR: [{ primaryUnitId: q.unitId }, { units: { some: { unitId: q.unitId } } }] });
    if (q.intent) f.push({ intent: q.intent as Prisma.EnquiryWhereInput['intent'] });
    if (q.leadSource) f.push({ leadSource: { in: csv(q.leadSource) as LeadSourceValue[] } });
    if (q.campaignId) f.push({ campaignId: q.campaignId });
    if (q.typologyId) f.push({ OR: [{ typologyId: q.typologyId }, { primaryUnit: { typologyId: q.typologyId } }, { units: { some: { unit: { typologyId: q.typologyId } } } }] });
    if (num(q.bedrooms) !== undefined) f.push({ OR: [{ bedrooms: num(q.bedrooms) }, { primaryUnit: { bedrooms: num(q.bedrooms) } }] });
    if (num(q.budgetMin) !== undefined) f.push({ budgetMaxMinor: { gte: num(q.budgetMin)! * 100 } });
    if (num(q.budgetMax) !== undefined) f.push({ OR: [{ budgetMinMinor: { lte: num(q.budgetMax)! * 100 } }, { budgetMinMinor: null, budgetMaxMinor: { lte: num(q.budgetMax)! * 100 } }] });
    if (q.tag) f.push({ tags: { has: q.tag } });
    if (q.priority) f.push({ priority: q.priority as Prisma.EnquiryWhereInput['priority'] });
    if (date(q.createdFrom)) f.push({ createdAt: { gte: date(q.createdFrom) } });
    if (date(q.createdTo)) f.push({ createdAt: { lt: new Date(date(q.createdTo)!.getTime() + 86_400_000) } });
    if (q.temperature) {
      const t = q.temperature;
      // The effective temperature: a manual override, else the score band.
      f.push(
        t === 'HOT'
          ? { OR: [{ temperature: 'HOT' }, { temperature: null, score: { gte: 70 } }] }
          : t === 'WARM'
            ? { OR: [{ temperature: 'WARM' }, { temperature: null, score: { gte: 40, lt: 70 } }] }
            : { OR: [{ temperature: 'COLD' }, { temperature: null, score: { lt: 40 } }] },
      );
    }
    if (q.lastActivity === '7d') f.push({ lastActivityAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } });
    if (q.lastActivity === 'stale') f.push({ OR: [{ lastActivityAt: { lt: new Date(now.getTime() - 14 * 86_400_000) } }, { lastActivityAt: null }], status: { notIn: CLOSED } });
    if (q.followUp === 'overdue') f.push({ followUpAt: { lt: now } });
    if (q.followUp === 'today') f.push({ followUpAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 86_400_000) } });
    if (q.followUp === 'week') f.push({ followUpAt: { gte: now, lt: new Date(now.getTime() + 7 * 86_400_000) } });
    if (q.followUp === 'none') f.push({ followUpAt: null, status: { notIn: CLOSED } });
    if (q.q?.trim()) {
      const term = q.q.trim();
      const like = { contains: term, mode: 'insensitive' as const };
      const tail = digits(term);
      f.push({
        OR: [
          { name: like },
          { email: like },
          { message: like },
          { city: like },
          ...(tail.length >= 3 ? [{ phone: { contains: tail } }, { whatsapp: { contains: tail } }] : []),
          { units: { some: { unit: { code: { contains: term.replace(/\s+/g, '-'), mode: 'insensitive' as const } } } } },
          { tags: { has: term.toLowerCase() } },
        ],
      });
    }
    return f;
  }

  private orderBy(sort?: string): Prisma.EnquiryOrderByWithRelationInput[] {
    switch (sort) {
      case 'score':
        return [{ score: 'desc' }, { createdAt: 'desc' }];
      case 'followUp':
        return [{ followUpAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }];
      case 'lastActivity':
        return [{ lastActivityAt: { sort: 'desc', nulls: 'last' } }];
      case 'name':
        return [{ name: 'asc' }];
      case 'oldest':
        return [{ createdAt: 'asc' }];
      default:
        return [{ createdAt: 'desc' }];
    }
  }

  private async thresholds(developmentId: string) {
    const s = await this.crm.settings(developmentId);
    return { hot: s.hotThreshold, warm: s.warmThreshold };
  }

  /** The row every list, card and export uses. */
  private shape(e: ListRow, thresholds: { hot: number; warm: number }, now = new Date()) {
    const { units, _count, viewings, tasks, deals, ...rest } = e;
    const unitCards = units.map((u) => u.unit);
    return {
      ...rest,
      units: unitCards,
      assignedToName: e.assignedTo?.name ?? null,
      effectiveTemperature: temperatureFor(e.score, e.temperature, thresholds),
      noteCount: _count.notes,
      openTaskCount: _count.tasks,
      nextTask: tasks[0] ?? null,
      openViewing: viewings[0] ?? null,
      openDeal: deals.find((d) => (OPEN_DEALS as readonly string[]).includes(d.status)) ?? null,
      valueMinor: this.crm.valueOf({ budgetMaxMinor: e.budgetMaxMinor, primaryUnit: e.primaryUnit, units: unitCards, deals }),
      overdue: isLeadOverdue(e, now),
    };
  }

  @Get()
  async list(@Req() req: AdminRequest, @Query() q: Record<string, string | undefined>) {
    const actor = actorOf(req);
    const p = pageOf(q.page, q.pageSize);
    const scope = await this.scope(actor, q.view === 'archived');
    const where: Prisma.EnquiryWhereInput = { AND: [scope, ...this.filters(q, actor.id)] };
    const developmentId = await this.dev.id();
    const [rows, total, byStatus, overdueCount, mine, unassigned, fresh, thresholds] = await Promise.all([
      this.prisma.client.enquiry.findMany({ where, orderBy: this.orderBy(q.sort), include: listInclude, skip: p.skip, take: p.take }),
      this.prisma.client.enquiry.count({ where }),
      this.prisma.client.enquiry.groupBy({ by: ['status'], where: scope, _count: true }),
      this.prisma.client.enquiry.count({ where: { AND: [scope, this.overdueWhere()] } }),
      this.prisma.client.enquiry.count({ where: { AND: [scope, { assignedToId: actor.id, status: { notIn: CLOSED } }] } }),
      this.prisma.client.enquiry.count({ where: { AND: [scope, { assignedToId: null, status: { notIn: CLOSED } }] } }),
      this.prisma.client.enquiry.count({ where: { AND: [scope, { status: 'NEW' }] } }),
      this.thresholds(developmentId),
    ]);
    const now = new Date();
    return {
      ...paged(rows.map((e) => this.shape(e, thresholds, now)), total, p),
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      overdue: overdueCount,
      mine,
      unassigned,
      new: fresh,
    };
  }

  /**
   * The Kanban board: every active column with its count, value and weighted
   * value, and the cards in it. Closed columns show only the last 30 days.
   */
  @Get('board')
  async board(@Req() req: AdminRequest, @Query() q: Record<string, string | undefined>) {
    const actor = actorOf(req);
    const developmentId = await this.dev.id();
    const scope = await this.scope(actor);
    const stages = (await this.crm.stages(developmentId)).filter((s) => s.active && s.category !== 'SPAM');
    const recent = new Date(Date.now() - 30 * 86_400_000);
    const where: Prisma.EnquiryWhereInput = {
      AND: [scope, ...this.filters({ ...q, status: undefined, view: q.view === 'overdue' ? 'overdue' : q.view }, actor.id), { status: { not: 'SPAM' } }, { OR: [{ status: { notIn: CLOSED } }, { stageChangedAt: { gte: recent } }] }],
    };
    const [rows, thresholds] = await Promise.all([
      this.prisma.client.enquiry.findMany({ where, orderBy: [{ score: 'desc' }, { createdAt: 'desc' }], include: listInclude, take: 1500 }),
      this.thresholds(developmentId),
    ]);
    const now = new Date();
    const cards = rows.map((e) => {
      const card = this.shape(e, thresholds, now);
      return { ...card, stageId: this.crm.effectiveStage(stages, e)?.id ?? null };
    });
    return {
      stages: stages.map((s) => {
        const inStage = cards.filter((c) => c.stageId === s.id);
        const value = inStage.reduce((a, c) => a + c.valueMinor, 0);
        return { ...s, closed: CLOSED.includes(s.category), count: inStage.length, valueMinor: value, weightedMinor: Math.round((value * s.probability) / 100) };
      }),
      leads: cards,
      truncated: rows.length === 1500,
    };
  }

  @Get('export.csv')
  @RequirePermission('enquiry.export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="leads.csv"')
  async exportCsv(@Req() req: AdminRequest, @Query() q: Record<string, string | undefined>) {
    const actor = actorOf(req);
    const scope = await this.scope(actor);
    const rows = await this.prisma.client.enquiry.findMany({
      where: { AND: [scope, ...this.filters(q, actor.id)] },
      orderBy: { createdAt: 'desc' },
      include: { units: { include: { unit: { select: { code: true } } } }, assignedTo: { select: { name: true } }, stage: { select: { label: true } }, campaign: { select: { name: true } }, typology: { select: { name: true } } },
      // The same cap as the residences export: a CSV is a report, not a backup.
      take: 5000,
    });
    await this.audit.record({ actorId: actor.id, action: 'enquiry.export', entity: 'enquiry', target: 'filtered', summary: `Exported ${rows.length} leads`, rowCount: rows.length, req });
    const header = ['id', 'created', 'name', 'email', 'phone', 'whatsapp', 'country', 'city', 'source', 'campaign', 'stage', 'score', 'temperature', 'priority', 'assigned_to', 'residences', 'type', 'bedrooms', 'budget_max', 'timeline', 'contacted', 'last_contact', 'follow_up', 'lost_reason', 'tags', 'utm_source'];
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""').replace(/^[=+\-@]/, "'$&")}"`;
    const lines = rows.map((e) =>
      [
        e.id,
        e.createdAt.toISOString(),
        e.name,
        e.email,
        e.phone,
        e.whatsapp,
        e.countryIso,
        e.city,
        LEAD_SOURCE_LABEL[e.leadSource as LeadSourceValue],
        e.campaign?.name,
        e.stage?.label ?? STAGE_LABEL[e.status],
        e.score,
        e.temperature ?? '',
        e.priority,
        e.assignedTo?.name,
        e.units.map((u) => u.unit.code).join(' '),
        e.typology?.name,
        e.bedrooms,
        e.budgetMaxMinor !== null ? e.budgetMaxMinor / 100 : '',
        e.timeline,
        e.contactedAt?.toISOString(),
        e.lastContactAt?.toISOString(),
        e.followUpAt?.toISOString(),
        e.lostReason,
        e.tags.join(' '),
        e.utmSource,
      ]
        .map(escape)
        .join(','),
    );
    return [header.join(','), ...lines].join('\n');
  }

  /** Possible existing leads for a name, email or phone — before creating one, and on every lead's page. */
  @Post('duplicates')
  @HttpCode(200)
  async duplicates(@Body() dto: DuplicateCheckDto, @Req() req: AdminRequest) {
    return { matches: await this.findDuplicates(await this.dev.id(), dto, actorOf(req), dto.excludeId) };
  }

  private async findDuplicates(developmentId: string, who: { name?: string | null; email?: string | null; phone?: string | null; whatsapp?: string | null }, actor: CrmActor, excludeId?: string) {
    const tails = [...new Set([digits(who.phone), digits(who.whatsapp)].filter((d) => d.length >= 7).map((d) => d.slice(-9)))];
    const email = who.email?.trim().toLowerCase();
    const name = who.name?.trim();
    const or: Prisma.EnquiryWhereInput[] = [
      ...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []),
      ...tails.flatMap((t) => [{ phone: { endsWith: t } }, { whatsapp: { endsWith: t } }]),
      ...(name && name.length >= 4 ? [{ name: { equals: name, mode: 'insensitive' as const } }] : []),
    ];
    if (!or.length) return [];
    const rows = await this.prisma.client.enquiry.findMany({
      where: { developmentId, archivedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}), OR: or },
      select: { id: true, name: true, email: true, phone: true, whatsapp: true, status: true, createdAt: true, assignedToId: true, assignedTo: { select: { name: true } }, stage: { select: { label: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const visible = can(actor, 'enquiry.view', 'ALL');
    return rows.map((r) => {
      const reasons = [
        email && r.email?.toLowerCase() === email ? 'Same email' : null,
        tails.some((t) => digits(r.phone).endsWith(t) || digits(r.whatsapp).endsWith(t)) ? 'Same phone' : null,
        name && r.name.toLowerCase() === name.toLowerCase() ? 'Same name' : null,
      ].filter((x): x is string => Boolean(x));
      // Someone else's lead: say it exists and whose it is, without handing over their contact details.
      const mine = visible || r.assignedToId === actor.id || r.assignedToId === null;
      return {
        id: r.id,
        name: r.name,
        email: mine ? r.email : null,
        phone: mine ? r.phone : null,
        stage: r.stage?.label ?? STAGE_LABEL[r.status],
        status: r.status,
        owner: r.assignedTo?.name ?? null,
        createdAt: r.createdAt,
        reasons,
        strong: reasons.some((x) => x !== 'Same name'),
        canOpen: mine,
      };
    });
  }

  /** A lead from a phone call, a walk-in, a portal or a referral. */
  @Post()
  @RequirePermission('enquiry.edit')
  async create(@Body() dto: CreateLeadDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const developmentId = await this.dev.id();
    await this.crm.ensureStages(developmentId);
    const development = await this.prisma.client.development.findUniqueOrThrow({ where: { id: developmentId }, select: { country: true, currency: true } });
    const email = dto.email?.trim().toLowerCase() || null;
    const phone = this.normalisePhone(dto.phone, development.country);
    const whatsapp = this.normalisePhone(dto.whatsapp, development.country);
    if (!email && !phone && !whatsapp) throw new BadRequestException('Add at least a phone number or an email, so someone can reach them.');
    if (!dto.force) {
      const matches = (await this.findDuplicates(developmentId, { name: dto.name, email, phone, whatsapp }, actor)).filter((m) => m.strong);
      if (matches.length) throw new ConflictException(`Possible existing lead: ${matches.map((m) => `${m.name} (${m.stage}${m.owner ? `, ${m.owner}` : ''})`).join('; ')}. Open it, or create anyway.`);
    }
    const assignedToId = await this.resolveAssignee(actor, dto.assignedToId, null, true);
    await this.assertRefs(developmentId, dto);
    const stages = await this.crm.stages(developmentId);
    const stage = dto.stageId ? stages.find((s) => s.id === dto.stageId && s.active) : this.crm.firstOf(stages, 'NEW');
    if (!stage) throw new BadRequestException('That pipeline stage does not exist.');
    if (stage.category === 'SOLD') assertCan(actor, 'deal.close');
    const unitIds = [...new Set([...(dto.unitIds ?? []), ...(dto.primaryUnitId ? [dto.primaryUnitId] : [])])];
    const now = new Date();

    const lead = await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.enquiry.create({
        data: {
          developmentId,
          name: dto.name.trim(),
          email,
          phone,
          whatsapp,
          countryIso: dto.countryIso?.toUpperCase() ?? null,
          city: dto.city ?? null,
          preferredContact: (dto.preferredContact as Prisma.EnquiryCreateInput['preferredContact']) ?? null,
          message: dto.message ?? null,
          intent: (dto.intent as Prisma.EnquiryCreateInput['intent']) ?? 'INFORMATION',
          leadSource: (dto.leadSource as LeadSourceValue) ?? 'PHONE',
          source: 'admin',
          campaignId: dto.campaignId ?? null,
          temperature: (dto.temperature as Prisma.EnquiryCreateInput['temperature']) ?? null,
          priority: (dto.priority as Prisma.EnquiryCreateInput['priority']) ?? 'NORMAL',
          stageId: stage.id,
          status: stage.category,
          assignedToId,
          createdById: actor.id,
          ...this.requirementFields(dto),
          contactedAt: stage.category !== 'NEW' ? now : null,
          lastActivityAt: now,
          purgeAfter: nextPurge(),
          units: unitIds.length ? { create: unitIds.map((unitId) => ({ unitId })) } : undefined,
        },
      });
      await tx.leadStageChange.create({ data: { enquiryId: row.id, toStageId: stage.id, toStatus: stage.category, actorId: actor.id } });
      await tx.leadNote.create({ data: { enquiryId: row.id, authorId: actor.id, kind: 'SYSTEM', body: `Lead created by ${actor.name} · ${LEAD_SOURCE_LABEL[row.leadSource as LeadSourceValue]}` } });
      if (dto.followUpAt) {
        await tx.leadTask.create({ data: { developmentId, enquiryId: row.id, title: `Follow up with ${row.name}`, type: 'FOLLOW_UP', dueAt: new Date(dto.followUpAt), assignedToId: assignedToId ?? actor.id, createdById: actor.id } });
        await this.crm.syncFollowUp(tx, row.id);
      }
      return row;
    });
    await this.audit.record({ actorId: actor.id, action: 'enquiry.create', entity: 'enquiry', entityId: lead.id, target: lead.name, summary: `Created lead ${lead.name} (${LEAD_SOURCE_LABEL[lead.leadSource as LeadSourceValue]})`, after: { status: lead.status, assignedToId, leadSource: lead.leadSource }, req });
    await this.crm.rescore(lead.id);
    if (assignedToId) await this.crm.notify([assignedToId], { kind: 'lead.assigned', title: `New lead: ${lead.name}`, body: `${actor.name} assigned a ${LEAD_SOURCE_LABEL[lead.leadSource as LeadSourceValue].toLowerCase()} lead to you.`, link: `/crm/leads/${lead.id}`, enquiryId: lead.id }, actor.id);
    return { id: lead.id };
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const lead = await this.prisma.client.enquiry.findFirst({
      where: { AND: [{ id, developmentId: await this.dev.id() }, this.crm.leadScope(actor)] },
      include: {
        ...listInclude,
        createdBy: { select: { id: true, name: true } },
        buyer: { select: { id: true, fullName: true, stage: true } },
        notes: { orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }], take: 300, include: { author: { select: { id: true, name: true } } } },
        tasks: { orderBy: [{ status: 'asc' }, { dueAt: { sort: 'asc', nulls: 'last' } }], take: 100, include: { assignedTo: { select: { id: true, name: true } }, unit: { select: { id: true, code: true } } } },
        viewings: { orderBy: [{ scheduledAt: { sort: 'desc', nulls: 'first' } }], include: { agent: { select: { id: true, name: true } }, units: { include: { unit: { select: { id: true, code: true } } } }, alternativeUnit: { select: { id: true, code: true } } } },
        reservations: { orderBy: { createdAt: 'desc' }, include: { unit: { select: { id: true, code: true } }, agent: { select: { name: true } } } },
        deals: { orderBy: { createdAt: 'desc' }, include: { unit: { select: unitCard }, agent: { select: { id: true, name: true } }, paymentPlan: { select: { id: true, name: true } } } },
        documents: { where: { archivedAt: null }, orderBy: { createdAt: 'desc' }, include: { uploadedBy: { select: { name: true } } } },
        stageChanges: { orderBy: { createdAt: 'asc' } },
        notifications: { orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, kind: true, recipient: true, status: true, lastError: true, sentAt: true, createdAt: true } },
      },
    });
    if (!lead) throw new NotFoundException('No such lead, or it belongs to another agent.');
    const [breakdown, stages, thresholds, duplicates] = await Promise.all([
      this.crm.rescore(id),
      this.crm.stages(lead.developmentId),
      this.thresholds(lead.developmentId),
      this.findDuplicates(lead.developmentId, lead, actor, id),
    ]);
    const unitCards = lead.units.map((u) => u.unit);
    const anchor = lead.primaryUnit ?? unitCards[0] ?? null;
    const similar = await this.crm.similarUnits(
      lead.developmentId,
      {
        typologyId: anchor?.typology.id ?? lead.typologyId,
        bedrooms: anchor?.bedrooms ?? lead.bedrooms,
        areaSqm: anchor?.areaSqm ?? lead.sizeMinSqm,
        priceMinor: anchor?.priceMinor ?? lead.budgetMaxMinor,
        budgetMaxMinor: lead.budgetMaxMinor,
        level: anchor?.floor.level ?? null,
      },
      [...unitCards.map((u) => u.id), ...(lead.primaryUnitId ? [lead.primaryUnitId] : [])],
    );
    const canDocs = can(actor, 'crm.documents');
    const { units, notes, viewings, _count, tasks, deals, documents, stageChanges, ...rest } = lead;
    const stageLabel = (sid: string | null, status: string | null) => (sid ? stages.find((s) => s.id === sid)?.label : null) ?? (status ? STAGE_LABEL[status] : null);
    return {
      ...rest,
      units: unitCards,
      stage: this.crm.effectiveStage(stages, lead) ?? null,
      assignedToName: lead.assignedTo?.name ?? null,
      overdue: isLeadOverdue(lead),
      score: breakdown?.score ?? lead.score,
      scoreItems: breakdown?.items ?? [],
      effectiveTemperature: temperatureFor(breakdown?.score ?? lead.score, lead.temperature, thresholds),
      valueMinor: this.crm.valueOf({ budgetMaxMinor: lead.budgetMaxMinor, primaryUnit: lead.primaryUnit, units: unitCards, deals }),
      noteCount: _count.notes,
      notes: notes.map(({ author, ...n }) => ({ ...n, authorName: author?.name ?? 'System' })),
      tasks,
      viewings: viewings.map(({ units: vu, ...v }) => ({ ...v, units: vu.map((x) => x.unit) })),
      deals,
      documents: canDocs ? documents.map(({ storageKey, ...d }) => ({ ...d, hasFile: Boolean(storageKey) })) : [],
      documentsHidden: !canDocs && documents.length > 0,
      stageHistory: stageChanges.map((c, i) => ({
        ...c,
        fromLabel: stageLabel(c.fromStageId, c.fromStatus),
        toLabel: stageLabel(c.toStageId, c.toStatus),
        hours: Math.round(((stageChanges[i + 1]?.createdAt ?? new Date()).getTime() - c.createdAt.getTime()) / 3_600_000),
      })),
      daysInStage: Math.floor((Date.now() - lead.stageChangedAt.getTime()) / 86_400_000),
      duplicates,
      similar,
      unavailableInterest: [...unitCards, ...(lead.primaryUnit ? [lead.primaryUnit] : [])].filter((u, i, all) => u.status !== 'AVAILABLE' && all.findIndex((x) => x.id === u.id) === i),
      stages: stages.filter((s) => s.active),
    };
  }

  @Patch(':id')
  @RequirePermission('enquiry.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateLeadDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const before = await this.owned(id, actor);
    const developmentId = before.developmentId;
    const assignedToId = dto.assignedToId !== undefined ? await this.resolveAssignee(actor, dto.assignedToId, before.assignedToId, false) : undefined;
    if (dto.buyerId) {
      assertCan(actor, 'buyer.edit');
      if (!(await this.prisma.client.buyer.count({ where: { id: dto.buyerId, developmentId } }))) throw new BadRequestException('That client does not belong to this property.');
    }
    await this.assertRefs(developmentId, dto);
    const development = await this.prisma.client.development.findUniqueOrThrow({ where: { id: developmentId }, select: { country: true } });
    const email = dto.email !== undefined ? dto.email?.trim().toLowerCase() || null : undefined;
    const phone = dto.phone !== undefined ? this.normalisePhone(dto.phone, development.country) : undefined;
    const whatsapp = dto.whatsapp !== undefined ? this.normalisePhone(dto.whatsapp, development.country) : undefined;
    if ((email === undefined ? before.email : email) === null && (phone === undefined ? before.phone : phone) === null && (whatsapp === undefined ? before.whatsapp : whatsapp) === null) {
      throw new BadRequestException('Keep at least a phone number or an email on the lead.');
    }

    // The stage the request asks for, resolved against the configurable pipeline.
    const stages = await this.crm.stages(developmentId);
    const target = dto.stageId ? stages.find((s) => s.id === dto.stageId) : dto.status ? this.crm.firstOf(stages, dto.status) : undefined;
    if ((dto.stageId || dto.status) && !target) throw new BadRequestException('That pipeline stage does not exist.');
    if (target?.category === 'LOST' && !dto.lostReason && !before.lostReason) throw new BadRequestException('Say why the lead was lost — it is what the reports learn from.');
    if (target?.category === 'SOLD' && before.status !== 'SOLD') assertCan(actor, 'deal.close');

    const unitIds = dto.unitIds ? [...new Set([...dto.unitIds, ...(dto.primaryUnitId ? [dto.primaryUnitId] : [])])] : dto.primaryUnitId ? [...new Set([...before.units.map((u) => u.unitId), dto.primaryUnitId])] : undefined;
    const interestChanged = unitIds !== undefined && (unitIds.length !== before.units.length || unitIds.some((u) => !before.units.some((b) => b.unitId === u)));

    const moved = await this.prisma.client.$transaction(async (tx) => {
      await tx.enquiry.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(email !== undefined ? { email } : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(whatsapp !== undefined ? { whatsapp } : {}),
          ...(dto.countryIso !== undefined ? { countryIso: dto.countryIso?.toUpperCase() ?? null } : {}),
          ...(dto.city !== undefined ? { city: dto.city } : {}),
          ...(dto.preferredContact !== undefined ? { preferredContact: dto.preferredContact as Prisma.EnquiryUpdateInput['preferredContact'] } : {}),
          ...(dto.leadSource !== undefined ? { leadSource: dto.leadSource as LeadSourceValue } : {}),
          ...(dto.campaignId !== undefined ? { campaignId: dto.campaignId } : {}),
          ...(dto.temperature !== undefined ? { temperature: dto.temperature as Prisma.EnquiryUpdateInput['temperature'] } : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority as Prisma.EnquiryUpdateInput['priority'] } : {}),
          ...(dto.message !== undefined ? { message: dto.message } : {}),
          ...(dto.tags !== undefined ? { tags: [...new Set(dto.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))] } : {}),
          ...this.requirementFields(dto),
          ...(assignedToId !== undefined ? { assignedToId } : {}),
          ...(dto.lostReason !== undefined ? { lostReason: dto.lostReason as LostReason | null } : {}),
          ...(dto.lostNote !== undefined ? { lostNote: dto.lostNote } : {}),
          ...(dto.buyerId !== undefined ? { buyerId: dto.buyerId } : {}),
          lastActivityAt: new Date(),
          purgeAfter: nextPurge(),
        },
      });
      if (unitIds) {
        await tx.enquiryUnit.deleteMany({ where: { enquiryId: id, unitId: { notIn: unitIds } } });
        for (const unitId of unitIds) await tx.enquiryUnit.upsert({ where: { enquiryId_unitId: { enquiryId: id, unitId } }, create: { enquiryId: id, unitId }, update: {} });
      }
      let didMove = false;
      if (target) {
        const reason = target.category === 'LOST' ? LOST_REASON_LABEL[(dto.lostReason ?? before.lostReason) as LostReasonValue] : undefined;
        didMove = await this.crm.moveLead(tx, before, { stageId: target.id }, actor.id, { reason });
      }
      if (assignedToId !== undefined && assignedToId !== before.assignedToId) {
        const who = assignedToId ? (await tx.adminUser.findUnique({ where: { id: assignedToId }, select: { name: true } }))?.name : null;
        await this.crm.logActivity(tx, id, 'ASSIGNMENT', who ? (assignedToId === actor.id && !before.assignedToId ? `${who} picked up the lead` : `Assigned to ${who}`) : 'Returned to the unassigned pool', actor.id, { meta: { from: before.assignedToId, to: assignedToId } });
        // Open tasks follow the lead to its new owner.
        await tx.leadTask.updateMany({ where: { enquiryId: id, status: 'OPEN', assignedToId: before.assignedToId }, data: { assignedToId } });
      }
      if (interestChanged) {
        const codes = unitIds!.length ? (await tx.unit.findMany({ where: { id: { in: unitIds } }, select: { code: true } })).map((u) => u.code).join(', ') : 'none';
        await this.crm.logActivity(tx, id, 'SYSTEM', `Property interest: ${codes}`, actor.id, { meta: { unitIds } });
      }
      if (dto.followUpAt !== undefined) await this.setFollowUp(tx, before, dto.followUpAt, actor);
      return didMove;
    });

    const after = await this.prisma.client.enquiry.findUniqueOrThrow({ where: { id } });
    const tracked = ['status', 'assignedToId', 'temperature', 'priority', 'leadSource', 'budgetMinMinor', 'budgetMaxMinor', 'primaryUnitId', 'typologyId', 'timeline', 'lostReason', 'email', 'phone'] as const;
    const changed = tracked.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    if (changed.length || interestChanged || dto.followUpAt !== undefined) {
      await this.audit.record({
        actorId: actor.id,
        action: moved ? 'enquiry.stage' : assignedToId !== undefined && assignedToId !== before.assignedToId ? 'enquiry.assign' : 'enquiry.update',
        entity: 'enquiry',
        entityId: id,
        target: before.name,
        summary: `Lead ${before.name}: ${[...changed.map((k) => (k === 'status' ? `stage ${STAGE_LABEL[before.status]} → ${STAGE_LABEL[after.status]}` : k)), interestChanged ? 'property interest' : null, dto.followUpAt !== undefined ? 'follow-up' : null].filter(Boolean).join(', ')}`,
        before: Object.fromEntries(changed.map((k) => [k, before[k]])),
        after: Object.fromEntries(changed.map((k) => [k, after[k]])),
        req,
      });
    }
    if (assignedToId && assignedToId !== before.assignedToId) {
      await this.crm.notify([assignedToId], { kind: 'lead.assigned', title: `Lead assigned: ${before.name}`, body: `${actor.name} assigned this lead to you.`, link: `/crm/leads/${id}`, enquiryId: id }, actor.id);
    }
    if (moved && target && ['RESERVED', 'CONTRACT', 'SOLD', 'LOST'].includes(target.category)) {
      await this.crm.notify([...(await this.crm.managerIds()), after.assignedToId], { kind: 'lead.stage', title: `${before.name} → ${target.label}`, body: `Moved by ${actor.name}.`, link: `/crm/leads/${id}`, enquiryId: id }, actor.id);
    }
    await this.crm.rescore(id);
    return { ok: true, moved };
  }

  /** §15.4 — a note, call or message, added to the lead's history. Never overwrites. */
  @Post(':id/notes')
  @RequirePermission('enquiry.edit')
  async addNote(@Param('id') id: string, @Body() dto: LeadNoteDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const lead = await this.owned(id, actor);
    const touch = dto.kind !== 'NOTE';
    const note = await this.prisma.client.$transaction(async (tx) => {
      const n = await this.crm.logActivity(tx, id, dto.kind as LeadNoteKind, dto.body.trim(), actor.id, { direction: touch ? (dto.direction ?? 'OUT') : null, durationMin: dto.durationMin ?? null });
      if (dto.pinned) await tx.leadNote.update({ where: { id: n.id }, data: { pinned: true } });
      await tx.enquiry.update({ where: { id }, data: { purgeAfter: nextPurge(), ...(touch && !lead.contactedAt ? { contactedAt: new Date() } : {}) } });
      // Calling, emailing or meeting a new lead is the first response.
      if (touch && lead.status === 'NEW') await this.crm.moveLead(tx, lead, { status: 'CONTACTED' }, actor.id, { forwardOnly: true, reason: `first ${LEAD_NOTE_LABEL[dto.kind]?.toLowerCase()}` });
      if (dto.followUpAt !== undefined) await this.setFollowUp(tx, lead, dto.followUpAt, actor);
      return n;
    });
    await this.audit.record({ actorId: actor.id, action: 'enquiry.note', entity: 'enquiry', entityId: id, target: lead.name, summary: `Logged a ${LEAD_NOTE_LABEL[dto.kind]?.toLowerCase() ?? dto.kind} on lead ${lead.name}`, req });
    await this.crm.rescore(id);
    return { ...note, authorName: note.author?.name ?? null };
  }

  @Patch(':id/notes/:noteId')
  @RequirePermission('enquiry.edit')
  async pin(@Param('id') id: string, @Param('noteId') noteId: string, @Body() dto: PinNoteDto, @Req() req: AdminRequest) {
    await this.owned(id, actorOf(req));
    const { count } = await this.prisma.client.leadNote.updateMany({ where: { id: noteId, enquiryId: id }, data: { pinned: dto.pinned } });
    if (!count) throw new NotFoundException('No such note');
    return { ok: true };
  }

  /** §15.9 — assign, move, tag, archive or mark spam many leads at once. */
  @Post('bulk')
  @HttpCode(200)
  @RequirePermission('enquiry.edit')
  async bulk(@Body() dto: BulkLeadDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const developmentId = await this.dev.id();
    const leads = await this.prisma.client.enquiry.findMany({ where: { AND: [{ id: { in: dto.ids }, developmentId }, this.crm.leadScope(actor, 'enquiry.edit')] }, select: { id: true, developmentId: true, status: true, stageId: true, contactedAt: true, assignedToId: true, name: true, tags: true } });
    if (leads.length !== dto.ids.length) throw new NotFoundException('Some leads were not found, or belong to another agent.');
    const now = new Date();
    let summary = '';
    if (dto.action === 'assign') {
      assertCan(actor, 'enquiry.assign');
      const to = dto.assignedToId ?? null;
      if (to) await this.assertAssignable(to);
      const who = to ? (await this.prisma.client.adminUser.findUnique({ where: { id: to }, select: { name: true } }))?.name : null;
      await this.prisma.client.$transaction(async (tx) => {
        await tx.enquiry.updateMany({ where: { id: { in: dto.ids } }, data: { assignedToId: to, lastActivityAt: now } });
        for (const l of leads.filter((x) => x.assignedToId !== to)) {
          await tx.leadNote.create({ data: { enquiryId: l.id, authorId: actor.id, kind: 'ASSIGNMENT', body: who ? `Assigned to ${who} · bulk` : 'Returned to the unassigned pool · bulk', meta: { from: l.assignedToId, to } } });
          await tx.leadTask.updateMany({ where: { enquiryId: l.id, status: 'OPEN', assignedToId: l.assignedToId }, data: { assignedToId: to } });
        }
      });
      if (to) await this.crm.notify([to], { kind: 'lead.assigned', title: `${dto.ids.length} lead${dto.ids.length === 1 ? '' : 's'} assigned to you`, body: `By ${actor.name}.`, link: '/enquiries?view=mine' }, actor.id);
      summary = `Assigned ${dto.ids.length} leads to ${who ?? 'nobody'}`;
    } else if (dto.action === 'archive' || dto.action === 'restore') {
      assertCan(actor, 'enquiry.archive');
      await this.prisma.client.enquiry.updateMany({ where: { id: { in: dto.ids } }, data: { archivedAt: dto.action === 'archive' ? now : null } });
      summary = `${dto.action === 'archive' ? 'Archived' : 'Restored'} ${dto.ids.length} leads`;
    } else if (dto.action === 'tag') {
      const add = (dto.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
      if (!add.length) throw new BadRequestException('Choose a tag to add.');
      await this.prisma.client.$transaction(leads.map((l) => this.prisma.client.enquiry.update({ where: { id: l.id }, data: { tags: [...new Set([...l.tags, ...add])] } })));
      summary = `Tagged ${dto.ids.length} leads ${add.join(', ')}`;
    } else {
      const stages = await this.crm.stages(developmentId);
      const target = dto.action === 'spam' ? this.crm.firstOf(stages, 'SPAM') ?? null : dto.stageId ? stages.find((s) => s.id === dto.stageId) : dto.status ? this.crm.firstOf(stages, dto.status) : undefined;
      const category = dto.action === 'spam' ? 'SPAM' : target?.category;
      if (!category) throw new BadRequestException('Choose the stage to move the leads to.');
      if (category === 'LOST' && !dto.lostReason) throw new BadRequestException('Say why the leads were lost.');
      if (category === 'SOLD') assertCan(actor, 'deal.close');
      await this.prisma.client.$transaction(async (tx) => {
        for (const l of leads) {
          if (dto.lostReason) await tx.enquiry.update({ where: { id: l.id }, data: { lostReason: dto.lostReason as LostReason } });
          if (target) await this.crm.moveLead(tx, l, { stageId: target.id }, actor.id, { bulk: true, reason: dto.lostReason ? LOST_REASON_LABEL[dto.lostReason as LostReasonValue] : undefined });
          else await tx.enquiry.update({ where: { id: l.id }, data: { status: 'SPAM', stageId: null, stageChangedAt: now } });
        }
        await tx.enquiry.updateMany({ where: { id: { in: dto.ids } }, data: { purgeAfter: nextPurge() } });
      });
      summary = dto.action === 'spam' ? `Marked ${dto.ids.length} leads as spam` : `Moved ${dto.ids.length} leads to ${target?.label ?? STAGE_LABEL[category]}`;
    }
    // One audit row for the batch, not one per lead (audit §20).
    await this.audit.record({ actorId: actor.id, action: `enquiry.bulk.${dto.action}`, entity: 'enquiry', summary, rowCount: dto.ids.length, after: { ids: dto.ids }, req });
    return { ok: true, count: dto.ids.length };
  }

  /** §13 — a lead becomes a contact (client) record, keeping the residences they asked about. */
  @Post(':id/convert')
  @RequirePermission('enquiry.edit')
  async convert(@Param('id') id: string, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    assertCan(actor, 'buyer.edit');
    const lead = await this.owned(id, actor);
    if (lead.buyerId) throw new ConflictException('This lead is already linked to a client.');
    const buyer = await this.prisma.client.$transaction((tx) => this.crm.linkBuyer(tx, lead, actor.id));
    await this.audit.record({ actorId: actor.id, action: 'enquiry.convert', entity: 'enquiry', entityId: id, target: lead.name, summary: `Linked lead ${lead.name} to client ${buyer.fullName}`, req });
    return buyer;
  }

  /**
   * Folds a duplicate into this lead: its history, tasks, viewings, deals,
   * reservations and documents move here; its contact details fill any gaps;
   * it is archived with a pointer to this one. Nothing is deleted.
   */
  @Post(':id/merge')
  @HttpCode(200)
  @RequirePermission('enquiry.merge')
  async merge(@Param('id') id: string, @Body() dto: MergeLeadDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    if (id === dto.otherId) throw new BadRequestException('A lead cannot be merged into itself.');
    const [primary, other] = await Promise.all([this.owned(id, actor), this.owned(dto.otherId, actor)]);
    await this.prisma.client.$transaction(async (tx) => {
      const move = { where: { enquiryId: other.id }, data: { enquiryId: primary.id } };
      await tx.leadNote.updateMany(move);
      await tx.leadTask.updateMany(move);
      await tx.viewing.updateMany(move);
      await tx.reservation.updateMany(move);
      await tx.deal.updateMany(move);
      await tx.leadDocument.updateMany(move);
      await tx.leadStageChange.updateMany(move);
      await tx.notification.updateMany(move);
      await tx.adminNotification.updateMany(move);
      for (const u of other.units) await tx.enquiryUnit.upsert({ where: { enquiryId_unitId: { enquiryId: primary.id, unitId: u.unitId } }, create: { enquiryId: primary.id, unitId: u.unitId }, update: {} });
      const fill = <K extends keyof typeof primary>(k: K) => (primary[k] === null || primary[k] === undefined ? other[k] : undefined);
      await tx.enquiry.update({
        where: { id: primary.id },
        data: {
          email: fill('email') as string | null | undefined,
          phone: fill('phone') as string | null | undefined,
          whatsapp: fill('whatsapp') as string | null | undefined,
          city: fill('city') as string | null | undefined,
          countryIso: fill('countryIso') as string | null | undefined,
          budgetMaxMinor: fill('budgetMaxMinor') as number | null | undefined,
          budgetMinMinor: fill('budgetMinMinor') as number | null | undefined,
          typologyId: fill('typologyId') as string | null | undefined,
          primaryUnitId: fill('primaryUnitId') as string | null | undefined,
          buyerId: fill('buyerId') as string | null | undefined,
          campaignId: fill('campaignId') as string | null | undefined,
          assignedToId: fill('assignedToId') as string | null | undefined,
          tags: [...new Set([...primary.tags, ...other.tags])],
          repeatCount: primary.repeatCount + other.repeatCount + 1,
          lastActivityAt: new Date(),
          purgeAfter: nextPurge(),
        },
      });
      await tx.enquiry.update({ where: { id: other.id }, data: { archivedAt: new Date(), duplicateOfId: primary.id } });
      await tx.leadNote.create({ data: { enquiryId: primary.id, authorId: actor.id, kind: 'SYSTEM', body: `Merged duplicate lead ${other.name} (created ${other.createdAt.toISOString().slice(0, 10)}) into this one.` } });
      await this.crm.syncFollowUp(tx, primary.id);
    });
    await this.audit.record({ actorId: actor.id, action: 'enquiry.merge', entity: 'enquiry', entityId: primary.id, target: primary.name, summary: `Merged lead ${other.name} into ${primary.name}`, before: { mergedId: other.id }, req });
    await this.crm.rescore(primary.id);
    return { ok: true };
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermission('enquiry.archive')
  async archive(@Param('id') id: string, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const lead = await this.owned(id, actor);
    if (lead.status === 'SOLD' || (await this.prisma.client.deal.count({ where: { enquiryId: id, status: { in: ['RESERVED', 'CONTRACT', 'SOLD'] } } }))) {
      throw new ConflictException('A lead with a reservation, contract or sale is part of the sales record and cannot be archived.');
    }
    await this.prisma.client.enquiry.update({ where: { id }, data: { archivedAt: new Date() } });
    await this.audit.record({ actorId: actor.id, action: 'enquiry.archive', entity: 'enquiry', entityId: id, target: lead.name, summary: `Archived lead ${lead.name}`, req });
    return { ok: true };
  }

  @Post(':id/restore')
  @HttpCode(200)
  @RequirePermission('enquiry.archive')
  async restore(@Param('id') id: string, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const lead = await this.prisma.client.enquiry.findFirst({ where: { id, developmentId: await this.dev.id(), archivedAt: { not: null } } });
    if (!lead) throw new NotFoundException('No such archived lead');
    await this.prisma.client.enquiry.update({ where: { id }, data: { archivedAt: null, duplicateOfId: null } });
    await this.audit.record({ actorId: actor.id, action: 'enquiry.restore', entity: 'enquiry', entityId: id, target: lead.name, summary: `Restored lead ${lead.name}`, req });
    return { ok: true };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  /** A lead the person may change — the `enquiry.edit` scope, which can be narrower than what they may read. */
  private async owned(id: string, actor: CrmActor) {
    const lead = await this.prisma.client.enquiry.findFirst({ where: { AND: [{ id, developmentId: await this.dev.id(), archivedAt: null }, this.crm.leadScope(actor, 'enquiry.edit')] }, include: { units: true } });
    if (!lead) throw new NotFoundException('No such lead, or it belongs to another agent.');
    return lead;
  }

  /**
   * Who may own a lead. Anyone may pick up an unassigned lead or hand back
   * their own; moving a lead to someone else needs `enquiry.assign`. The owner
   * is never taken from the client on trust: it is checked against the session.
   */
  private async resolveAssignee(actor: Actor, requested: string | null | undefined, current: string | null, creating: boolean): Promise<string | null> {
    const mayAssign = can(actor, 'enquiry.assign');
    if (requested === undefined) return creating && !mayAssign ? actor.id : (current ?? null);
    if (requested === current) return current;
    const selfClaim = requested === actor.id && (current === null || creating);
    const release = requested === null && current === actor.id;
    if (!mayAssign && !selfClaim && !release) throw new ForbiddenException('Only a sales manager can give a lead to someone else. You can pick up unassigned leads.');
    if (requested) await this.assertAssignable(requested);
    return requested;
  }

  private async assertAssignable(userId: string) {
    const u = await this.prisma.client.adminUser.findUnique({ where: { id: userId }, select: { active: true } });
    if (!u?.active) throw new BadRequestException('That team member does not exist or is inactive.');
    if (!(await this.access.userCan(userId, 'enquiry.edit'))) throw new BadRequestException('That person’s role cannot work leads.');
  }

  private async assertRefs(developmentId: string, dto: { unitIds?: string[]; primaryUnitId?: string | null; typologyId?: string | null; campaignId?: string | null }) {
    const ids = [...new Set([...(dto.unitIds ?? []), ...(dto.primaryUnitId ? [dto.primaryUnitId] : [])])];
    if (ids.length && (await this.prisma.client.unit.count({ where: { id: { in: ids }, developmentId, archivedAt: null } })) !== ids.length) {
      throw new BadRequestException('Some of those residences do not exist on this property.');
    }
    if (dto.typologyId && !(await this.prisma.client.typology.count({ where: { id: dto.typologyId, developmentId } }))) throw new BadRequestException('That residence type does not exist.');
    if (dto.campaignId && !(await this.prisma.client.campaign.count({ where: { id: dto.campaignId, developmentId } }))) throw new BadRequestException('That campaign does not exist.');
  }

  private requirementFields(dto: UpdateLeadDto | CreateLeadDto) {
    const keys = ['typologyId', 'primaryUnitId', 'bedrooms', 'sizeMinSqm', 'sizeMaxSqm', 'budgetMinMinor', 'budgetMaxMinor', 'floorPreference', 'purpose', 'financingRequired', 'budgetConfirmed', 'timeline', 'decisionMaker'] as const;
    if (dto.budgetMinMinor != null && dto.budgetMaxMinor != null && dto.budgetMinMinor > dto.budgetMaxMinor) throw new BadRequestException('The minimum budget is above the maximum.');
    if (dto.sizeMinSqm != null && dto.sizeMaxSqm != null && dto.sizeMinSqm > dto.sizeMaxSqm) throw new BadRequestException('The minimum size is above the maximum.');
    return Object.fromEntries(keys.filter((k) => dto[k] !== undefined).map((k) => [k, dto[k]])) as Partial<Pick<Prisma.EnquiryUncheckedCreateInput, (typeof keys)[number]>>;
  }

  /** The quick "next follow-up" date: moves the open follow-up task, creates one, or clears them. */
  private async setFollowUp(tx: Prisma.TransactionClient, lead: { id: string; developmentId: string; name: string; assignedToId: string | null }, when: string | null, actor: Actor) {
    const open = await tx.leadTask.findFirst({ where: { enquiryId: lead.id, status: 'OPEN', type: 'FOLLOW_UP' }, orderBy: { dueAt: 'asc' } });
    if (when === null) {
      await tx.leadTask.updateMany({ where: { enquiryId: lead.id, status: 'OPEN', type: 'FOLLOW_UP' }, data: { status: 'CANCELLED', completedAt: new Date(), completedById: actor.id } });
    } else if (open) {
      await tx.leadTask.update({ where: { id: open.id }, data: { dueAt: new Date(when) } });
    } else {
      await tx.leadTask.create({ data: { developmentId: lead.developmentId, enquiryId: lead.id, title: `Follow up with ${lead.name}`, type: 'FOLLOW_UP', dueAt: new Date(when), assignedToId: lead.assignedToId ?? actor.id, createdById: actor.id } });
    }
    await this.crm.syncFollowUp(tx, lead.id);
  }

  private normalisePhone(input: string | null | undefined, country: string): string | null {
    const raw = input?.trim();
    if (!raw) return null;
    try {
      const parsed = parsePhoneNumberWithError(raw, country as never);
      if (parsed.isValid()) return parsed.number;
    } catch {
      /* fall through */
    }
    if (digits(raw).length < 7) throw new BadRequestException(`"${raw}" does not look like a phone number. Include the country code, for example +250 788 123 456.`);
    return raw;
  }
}
