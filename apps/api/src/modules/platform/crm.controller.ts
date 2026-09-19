import { Controller, Get, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import type { EnquiryStatus, LeadNoteKind, Prisma } from '@avida/db';
import { can, FIRST_RESPONSE_HOURS, PIPELINE_STAGES, stageRank } from '@avida/types';
import { CrmService } from '../../common/crm.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { pageOf, paged } from '../../common/http.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { PrismaService } from '../../common/prisma.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf, type Actor } from './actor.js';

const CLOSED: EnquiryStatus[] = ['SOLD', 'LOST', 'DISQUALIFIED', 'SPAM'];
const BOOKED = ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'] as const;
const DAY = 86_400_000;

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

/**
 * The CRM's read side: the dashboard a salesperson opens every morning, the
 * team's workload for a manager, the activity feed, and the reports that say
 * which sources sell and where leads stall. Agents see their own numbers;
 * `enquiry.view-all` sees the team.
 */
@Controller('admin/crm')
@UseGuards(AdminGuard)
@RequirePermission('enquiry.view')
@UseInterceptors(NoStoreInterceptor)
export class CrmController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly crm: CrmService,
  ) {}

  private async leadWhere(actor: Actor, mine: boolean): Promise<Prisma.EnquiryWhereInput> {
    const developmentId = await this.dev.id();
    await this.crm.ensureStages(developmentId);
    const all = can(actor.role, 'enquiry.view-all');
    return { developmentId, archivedAt: null, status: { not: 'SPAM' }, ...(mine || !all ? { assignedToId: actor.id } : {}) };
  }

  @Get('dashboard')
  async dashboard(@Req() req: AdminRequest, @Query('scope') scopeParam?: string) {
    const actor = actorOf(req);
    const developmentId = await this.dev.id();
    const team = can(actor.role, 'enquiry.view-all');
    const mine = scopeParam === 'mine' || !team;
    const leads = await this.leadWhere(actor, mine);
    const taskWho: Prisma.LeadTaskWhereInput = mine ? { assignedToId: actor.id } : {};
    const dealWho: Prisma.DealWhereInput = mine ? { OR: [{ agentId: actor.id }, { enquiry: { assignedToId: actor.id } }] } : {};
    const viewingWho: Prisma.ViewingWhereInput = mine ? { OR: [{ agentId: actor.id }, { enquiry: { assignedToId: actor.id } }] } : {};
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + DAY);
    const weekStart = new Date(now.getTime() - 7 * DAY);
    const d30 = new Date(now.getTime() - 30 * DAY);
    const d60 = new Date(now.getTime() - 60 * DAY);
    const d90 = new Date(now.getTime() - 90 * DAY);

    const openLeads = { ...leads, status: { notIn: CLOSED } };
    const [
      stages,
      open,
      newLeads,
      newPrev,
      tasks,
      overdueTaskCount,
      todayTaskCount,
      upcomingTaskCount,
      viewingsToday,
      viewingsWeek,
      viewingRequests,
      unassigned,
      uncontacted,
      deals,
      activeHolds,
      soldDeals,
      recent,
      myWeek,
      funnelLeads,
      sources,
      settings,
    ] = await Promise.all([
      this.crm.stages(developmentId),
      this.prisma.client.enquiry.findMany({
        where: openLeads,
        select: { id: true, stageId: true, status: true, budgetMaxMinor: true, score: true, temperature: true, assignedToId: true, primaryUnit: { select: { priceMinor: true } }, units: { select: { unit: { select: { priceMinor: true } } } }, deals: { where: { status: { in: ['NEGOTIATION', 'RESERVED', 'CONTRACT'] } }, select: { status: true, agreedPriceMinor: true, listPriceMinor: true } } },
      }),
      this.prisma.client.enquiry.count({ where: { ...leads, createdAt: { gte: d30 } } }),
      this.prisma.client.enquiry.count({ where: { ...leads, createdAt: { gte: d60, lt: d30 } } }),
      this.prisma.client.leadTask.findMany({
        where: { developmentId, status: 'OPEN', ...taskWho, dueAt: { lt: new Date(dayStart.getTime() + 3 * DAY) } },
        orderBy: { dueAt: 'asc' },
        take: 40,
        include: { enquiry: { select: { id: true, name: true, phone: true, whatsapp: true, primaryUnit: { select: { code: true } } } }, assignedTo: { select: { name: true } } },
      }),
      this.prisma.client.leadTask.count({ where: { developmentId, status: 'OPEN', ...taskWho, dueAt: { lt: now } } }),
      this.prisma.client.leadTask.count({ where: { developmentId, status: 'OPEN', ...taskWho, dueAt: { gte: now, lt: dayEnd } } }),
      this.prisma.client.leadTask.count({ where: { developmentId, status: 'OPEN', ...taskWho, dueAt: { gte: dayEnd } } }),
      this.prisma.client.viewing.findMany({ where: { developmentId, ...viewingWho, status: { in: [...BOOKED] }, scheduledAt: { gte: dayStart, lt: dayEnd } }, orderBy: { scheduledAt: 'asc' }, include: { agent: { select: { name: true } }, units: { select: { unit: { select: { code: true } } } } } }),
      this.prisma.client.viewing.count({ where: { developmentId, ...viewingWho, status: { in: [...BOOKED] }, scheduledAt: { gte: now, lt: new Date(now.getTime() + 7 * DAY) } } }),
      this.prisma.client.viewing.count({ where: { developmentId, ...viewingWho, status: 'REQUESTED' } }),
      team && !mine
        ? this.prisma.client.enquiry.findMany({ where: { developmentId, archivedAt: null, assignedToId: null, status: { notIn: CLOSED } }, orderBy: { createdAt: 'asc' }, take: 8, select: { id: true, name: true, createdAt: true, leadSource: true, score: true, units: { select: { unit: { select: { code: true } } } } } })
        : this.prisma.client.enquiry.findMany({ where: { developmentId, archivedAt: null, assignedToId: null, status: 'NEW' }, orderBy: { createdAt: 'asc' }, take: 8, select: { id: true, name: true, createdAt: true, leadSource: true, score: true, units: { select: { unit: { select: { code: true } } } } } }),
      this.prisma.client.enquiry.count({ where: { ...leads, status: 'NEW', contactedAt: null, createdAt: { lt: new Date(now.getTime() - FIRST_RESPONSE_HOURS * 3_600_000) } } }),
      this.prisma.client.deal.findMany({ where: { developmentId, archivedAt: null, ...dealWho, status: { in: ['NEGOTIATION', 'RESERVED', 'CONTRACT'] } }, select: { status: true, agreedPriceMinor: true, listPriceMinor: true } }),
      this.prisma.client.reservation.findMany({ where: { developmentId, status: 'ACTIVE', ...(mine ? { OR: [{ agentId: actor.id }, { enquiry: { assignedToId: actor.id } }] } : {}) }, orderBy: { heldUntil: 'asc' }, select: { id: true, heldUntil: true, depositReceivedAt: true, enquiryId: true, unit: { select: { code: true } }, buyer: { select: { fullName: true } } } }),
      this.prisma.client.deal.findMany({ where: { developmentId, ...dealWho, status: 'SOLD', closedAt: { gte: d90 } }, select: { agreedPriceMinor: true, listPriceMinor: true, closedAt: true } }),
      this.prisma.client.leadNote.findMany({
        where: { enquiry: leads, kind: { not: 'SYSTEM' } },
        orderBy: { createdAt: 'desc' },
        take: 25,
        include: { author: { select: { name: true } }, enquiry: { select: { id: true, name: true } } },
      }),
      this.prisma.client.leadNote.groupBy({ by: ['kind'], where: { authorId: actor.id, createdAt: { gte: weekStart } }, _count: true }),
      this.prisma.client.enquiry.findMany({ where: { ...leads, createdAt: { gte: d90 } }, select: { status: true, contactedAt: true, stageChanges: { select: { toStatus: true } } } }),
      this.prisma.client.enquiry.groupBy({ by: ['leadSource'], where: { ...leads, createdAt: { gte: d90 } }, _count: true }),
      this.crm.settings(developmentId),
    ]);

    const currency = (await this.dev.get()).currency;
    const valueOf = (l: (typeof open)[number]) => this.crm.valueOf({ budgetMaxMinor: l.budgetMaxMinor, primaryUnit: l.primaryUnit, units: l.units.map((u) => u.unit), deals: l.deals });
    const active = stages.filter((s) => s.active && !CLOSED.includes(s.category));
    const pipeline = active.map((s) => {
      const inStage = open.filter((l) => this.crm.effectiveStage(stages, l)?.id === s.id);
      const value = inStage.reduce((a, l) => a + valueOf(l), 0);
      return { id: s.id, label: s.label, color: s.color, category: s.category, probability: s.probability, count: inStage.length, valueMinor: value, weightedMinor: Math.round((value * s.probability) / 100) };
    });
    const pipelineValue = pipeline.reduce((a, s) => a + s.valueMinor, 0);
    const weightedValue = pipeline.reduce((a, s) => a + s.weightedMinor, 0);
    const rankOf = (st: string) => stageRank(st);
    const reached = (l: (typeof funnelLeads)[number]) => Math.max(rankOf(l.status), ...l.stageChanges.map((c) => rankOf(c.toStatus)), l.contactedAt ? rankOf('CONTACTED') : 0);
    const funnelSteps: [string, EnquiryStatus][] = [['Contacted', 'CONTACTED'], ['Qualified', 'QUALIFIED'], ['Viewing', 'VIEWING_SCHEDULED'], ['Negotiation', 'NEGOTIATION'], ['Reserved', 'RESERVED'], ['Sold', 'SOLD']];
    const hot = open.filter((l) => (l.temperature ?? (l.score >= settings.hotThreshold ? 'HOT' : null)) === 'HOT').length;

    return {
      scope: mine ? 'mine' : 'team',
      canTeam: team,
      currency,
      kpis: {
        newLeads,
        newLeadsPrev: newPrev,
        openLeads: open.length,
        hotLeads: hot,
        qualified: open.filter((l) => rankOf(l.status) >= rankOf('QUALIFIED')).length,
        upcomingViewings: viewingsWeek,
        viewingRequests,
        overdueFollowUps: overdueTaskCount + uncontacted,
        negotiations: deals.filter((d) => d.status === 'NEGOTIATION').length,
        reservations: activeHolds.length,
        soldCount: soldDeals.length,
        soldValueMinor: soldDeals.reduce((a, d) => a + (d.agreedPriceMinor ?? d.listPriceMinor), 0),
        pipelineValueMinor: pipelineValue,
        weightedValueMinor: weightedValue,
      },
      followUps: {
        overdue: overdueTaskCount,
        today: todayTaskCount,
        upcoming: upcomingTaskCount,
        uncontacted,
        items: tasks.map((t) => ({ id: t.id, title: t.title, type: t.type, dueAt: t.dueAt, allDay: t.allDay, priority: t.priority, lead: t.enquiry, assignee: t.assignedTo?.name ?? null })),
      },
      viewingsToday: viewingsToday.map((v) => ({ id: v.id, name: v.name, scheduledAt: v.scheduledAt, status: v.status, agent: v.agent?.name ?? null, enquiryId: v.enquiryId, units: v.units.map((u) => u.unit.code) })),
      unassigned: unassigned.map((l) => ({ ...l, units: l.units.map((u) => u.unit.code) })),
      pipeline,
      funnel: [{ label: 'Leads', count: funnelLeads.length }, ...funnelSteps.map(([label, st]) => ({ label, count: funnelLeads.filter((l) => reached(l) >= rankOf(st)).length }))],
      holds: activeHolds.map((r) => ({ id: r.id, code: r.unit.code, heldUntil: r.heldUntil, buyer: r.buyer?.fullName ?? null, depositReceived: Boolean(r.depositReceivedAt), enquiryId: r.enquiryId, hoursLeft: Math.round((r.heldUntil.getTime() - now.getTime()) / 3_600_000) })),
      recent: recent.map((n) => ({ id: n.id, kind: n.kind, body: n.body, createdAt: n.createdAt, author: n.author?.name ?? 'System', lead: n.enquiry, direction: n.direction })),
      myWeek: Object.fromEntries(myWeek.map((g) => [g.kind, g._count])),
      sources: sources.map((s) => ({ source: s.leadSource, count: s._count })).sort((a, b) => b.count - a.count),
    };
  }

  /** Managers: who is carrying what, and where attention is slipping. Not a leaderboard. */
  @Get('team')
  @RequirePermission('enquiry.view-all')
  async team() {
    const developmentId = await this.dev.id();
    const now = new Date();
    const users = await this.prisma.client.adminUser.findMany({ where: { active: true, role: { in: ['SUPER_ADMIN', 'SALES_MANAGER', 'SALES_AGENT'] } }, select: { id: true, name: true, role: true, lastLoginAt: true }, orderBy: { name: 'asc' } });
    const ids = users.map((u) => u.id);
    const [leads, fresh, overdue, viewings, deals, lastNote, week] = await Promise.all([
      this.prisma.client.enquiry.findMany({ where: { developmentId, archivedAt: null, assignedToId: { in: ids }, status: { notIn: CLOSED } }, select: { assignedToId: true, budgetMaxMinor: true, primaryUnit: { select: { priceMinor: true } }, units: { select: { unit: { select: { priceMinor: true } } } }, deals: { where: { status: { in: ['NEGOTIATION', 'RESERVED', 'CONTRACT'] } }, select: { status: true, agreedPriceMinor: true, listPriceMinor: true } } } }),
      this.prisma.client.enquiry.groupBy({ by: ['assignedToId'], where: { developmentId, archivedAt: null, assignedToId: { in: ids }, status: 'NEW', contactedAt: null }, _count: true }),
      this.prisma.client.leadTask.groupBy({ by: ['assignedToId'], where: { developmentId, status: 'OPEN', assignedToId: { in: ids }, dueAt: { lt: now } }, _count: true }),
      this.prisma.client.viewing.groupBy({ by: ['agentId'], where: { developmentId, agentId: { in: ids }, status: { in: [...BOOKED] }, scheduledAt: { gte: now, lt: new Date(now.getTime() + 7 * DAY) } }, _count: true }),
      this.prisma.client.deal.groupBy({ by: ['agentId'], where: { developmentId, agentId: { in: ids }, status: { in: ['NEGOTIATION', 'RESERVED', 'CONTRACT'] } }, _count: true }),
      this.prisma.client.leadNote.groupBy({ by: ['authorId'], where: { authorId: { in: ids } }, _max: { createdAt: true } }),
      this.prisma.client.leadNote.groupBy({ by: ['authorId'], where: { authorId: { in: ids }, createdAt: { gte: new Date(now.getTime() - 7 * DAY) }, kind: { in: ['CALL', 'EMAIL', 'WHATSAPP', 'SMS', 'MEETING'] } }, _count: true }),
    ]);
    const count = <T extends { _count: number }>(rows: T[], key: keyof T, id: string) => rows.find((r) => r[key] === id)?._count ?? 0;
    const unassigned = await this.prisma.client.enquiry.count({ where: { developmentId, archivedAt: null, assignedToId: null, status: { notIn: CLOSED } } });
    return {
      unassigned,
      members: users.map((u) => {
        const mineLeads = leads.filter((l) => l.assignedToId === u.id);
        return {
          ...u,
          openLeads: mineLeads.length,
          uncontacted: count(fresh, 'assignedToId', u.id),
          overdueTasks: count(overdue, 'assignedToId', u.id),
          viewingsWeek: count(viewings, 'agentId', u.id),
          openDeals: count(deals, 'agentId', u.id),
          touchesWeek: count(week, 'authorId', u.id),
          pipelineMinor: mineLeads.reduce((a, l) => a + this.crm.valueOf({ budgetMaxMinor: l.budgetMaxMinor, primaryUnit: l.primaryUnit, units: l.units.map((x) => x.unit), deals: l.deals }), 0),
          lastActivityAt: lastNote.find((n) => n.authorId === u.id)?._max.createdAt ?? null,
        };
      }),
    };
  }

  /** Every touch across the CRM, newest first. */
  @Get('activities')
  async activities(@Req() req: AdminRequest, @Query('kind') kind?: string, @Query('authorId') authorId?: string, @Query('from') from?: string, @Query('to') to?: string, @Query('page') page?: string, @Query('q') q?: string) {
    const actor = actorOf(req);
    const developmentId = await this.dev.id();
    const p = pageOf(page, 40, 100);
    const where: Prisma.LeadNoteWhereInput = {
      enquiry: { developmentId, ...this.crm.leadScope(actor) },
      ...(kind ? { kind: { in: kind.split(',') as LeadNoteKind[] } } : {}),
      ...(authorId ? { authorId: authorId === 'me' ? actor.id : authorId } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lt: new Date(new Date(to).getTime() + DAY) } : {}) } } : {}),
      ...(q?.trim() ? { OR: [{ body: { contains: q.trim(), mode: 'insensitive' } }, { enquiry: { name: { contains: q.trim(), mode: 'insensitive' } } }] } : {}),
    };
    const [rows, total, byKind] = await Promise.all([
      this.prisma.client.leadNote.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, include: { author: { select: { id: true, name: true } }, enquiry: { select: { id: true, name: true, stage: { select: { label: true, color: true } } } } } }),
      this.prisma.client.leadNote.count({ where }),
      this.prisma.client.leadNote.groupBy({ by: ['kind'], where: { enquiry: { developmentId, ...this.crm.leadScope(actor) }, createdAt: { gte: new Date(Date.now() - 30 * DAY) } }, _count: true }),
    ]);
    return { ...paged(rows.map(({ author, ...n }) => ({ ...n, authorName: author?.name ?? 'System' })), total, p), byKind: Object.fromEntries(byKind.map((k) => [k.kind, k._count])) };
  }

  /**
   * The management reports: sources that sell, where leads stall, how fast
   * the team answers, and why deals are lost. Filterable by date range,
   * salesperson, residence type and source.
   */
  @Get('reports')
  @RequirePermission('reports.view')
  async reports(@Query('from') fromQ?: string, @Query('to') toQ?: string, @Query('agentId') agentId?: string, @Query('typologyId') typologyId?: string, @Query('source') source?: string) {
    const developmentId = await this.dev.id();
    await this.crm.ensureStages(developmentId);
    const to = toQ && !Number.isNaN(Date.parse(toQ)) ? new Date(new Date(toQ).getTime() + DAY) : new Date();
    const from = fromQ && !Number.isNaN(Date.parse(fromQ)) ? new Date(fromQ) : new Date(to.getTime() - 90 * DAY);
    const where: Prisma.EnquiryWhereInput = {
      developmentId,
      status: { not: 'SPAM' },
      duplicateOfId: null,
      createdAt: { gte: from, lt: to },
      ...(agentId ? { assignedToId: agentId } : {}),
      ...(source ? { leadSource: source as Prisma.EnquiryWhereInput['leadSource'] } : {}),
      ...(typologyId ? { OR: [{ typologyId }, { primaryUnit: { typologyId } }, { units: { some: { unit: { typologyId } } } }] } : {}),
    };
    const [leads, stages, tasks, reservations, campaigns] = await Promise.all([
      this.prisma.client.enquiry.findMany({
        where,
        select: {
          id: true,
          status: true,
          leadSource: true,
          lostReason: true,
          createdAt: true,
          contactedAt: true,
          budgetMaxMinor: true,
          assignedTo: { select: { id: true, name: true } },
          typology: { select: { id: true, name: true } },
          campaign: { select: { id: true, name: true } },
          primaryUnit: { select: { id: true, code: true, priceMinor: true, typology: { select: { id: true, name: true } } } },
          units: { select: { unit: { select: { id: true, code: true, priceMinor: true, typology: { select: { id: true, name: true } } } } } },
          viewings: { select: { status: true } },
          deals: { select: { status: true, agreedPriceMinor: true, listPriceMinor: true } },
          stageChanges: { select: { toStatus: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
        },
      }),
      this.crm.stages(developmentId),
      this.prisma.client.leadTask.findMany({ where: { developmentId, dueAt: { gte: from, lt: to }, status: { not: 'CANCELLED' }, ...(agentId ? { assignedToId: agentId } : {}) }, select: { status: true, dueAt: true, completedAt: true } }),
      this.prisma.client.reservation.findMany({ where: { developmentId, createdAt: { gte: from, lt: to }, ...(agentId ? { agentId } : {}) }, select: { status: true } }),
      this.prisma.client.campaign.findMany({ where: { developmentId }, select: { id: true, name: true, channel: true, budgetMinor: true } }),
    ]);

    const rank = (s: string) => stageRank(s);
    const reached = (l: (typeof leads)[number], st: string) => rank(l.status) >= rank(st) || l.stageChanges.some((c) => rank(c.toStatus) >= rank(st));
    const won = (l: (typeof leads)[number]) => l.status === 'SOLD';
    const hadViewing = (l: (typeof leads)[number]) => l.viewings.some((v) => v.status !== 'CANCELLED' && v.status !== 'REQUESTED') || reached(l, 'VIEWING_SCHEDULED');
    const typeOf = (l: (typeof leads)[number]) => l.typology ?? l.primaryUnit?.typology ?? l.units[0]?.unit.typology ?? null;
    const valueOf = (l: (typeof leads)[number]) => this.crm.valueOf({ budgetMaxMinor: l.budgetMaxMinor, primaryUnit: l.primaryUnit, units: l.units.map((u) => u.unit), deals: l.deals });

    const group = <K extends string>(keyOf: (l: (typeof leads)[number]) => { key: K; label: string } | null) => {
      const m = new Map<string, { key: string; label: string; leads: number; contacted: number; qualified: number; viewings: number; won: number; lost: number; valueMinor: number }>();
      for (const l of leads) {
        const k = keyOf(l);
        if (!k) continue;
        const row = m.get(k.key) ?? { key: k.key, label: k.label, leads: 0, contacted: 0, qualified: 0, viewings: 0, won: 0, lost: 0, valueMinor: 0 };
        row.leads++;
        if (l.contactedAt || reached(l, 'CONTACTED')) row.contacted++;
        if (reached(l, 'QUALIFIED')) row.qualified++;
        if (hadViewing(l)) row.viewings++;
        if (won(l)) (row.won++, (row.valueMinor += valueOf(l)));
        if (l.status === 'LOST' || l.status === 'DISQUALIFIED') row.lost++;
        m.set(k.key, row);
      }
      return [...m.values()].map((r) => ({ ...r, conversion: pct(r.won, r.leads) })).sort((a, b) => b.leads - a.leads);
    };

    // Average hours spent in each stage, from the stage history (the current stage counts up to now).
    const dwell = new Map<string, number[]>();
    for (const l of leads) {
      const changes = l.stageChanges;
      changes.forEach((c, i) => {
        const end = changes[i + 1]?.createdAt ?? (CLOSED.includes(c.toStatus) ? null : new Date());
        if (!end) return;
        const list = dwell.get(c.toStatus) ?? [];
        list.push((end.getTime() - c.createdAt.getTime()) / 3_600_000);
        dwell.set(c.toStatus, list);
      });
    }
    const responses = leads.filter((l) => l.contactedAt).map((l) => (l.contactedAt!.getTime() - l.createdAt.getTime()) / 3_600_000);
    const now = Date.now();
    const onTime = tasks.filter((t) => t.status === 'DONE' && t.completedAt && t.dueAt && t.completedAt <= new Date(t.dueAt.getTime() + 60 * 60_000)).length;
    const late = tasks.filter((t) => t.status === 'DONE' && t.completedAt && t.dueAt && t.completedAt > new Date(t.dueAt.getTime() + 60 * 60_000)).length;
    const missed = tasks.filter((t) => t.status === 'OPEN' && t.dueAt && t.dueAt.getTime() < now).length;

    const weeks = new Map<string, { week: string; leads: number; won: number }>();
    for (const l of leads) {
      const d = new Date(l.createdAt);
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      const key = d.toISOString().slice(0, 10);
      const row = weeks.get(key) ?? { week: key, leads: 0, won: 0 };
      row.leads++;
      if (won(l)) row.won++;
      weeks.set(key, row);
    }

    const byResidence = new Map<string, { key: string; label: string; leads: number; won: number }>();
    for (const l of leads) {
      const seen = new Set<string>();
      for (const u of [...(l.primaryUnit ? [l.primaryUnit] : []), ...l.units.map((x) => x.unit)]) {
        if (seen.has(u.id)) continue;
        seen.add(u.id);
        const row = byResidence.get(u.id) ?? { key: u.id, label: u.code, leads: 0, won: 0 };
        row.leads++;
        if (won(l)) row.won++;
        byResidence.set(u.id, row);
      }
    }

    const open = leads.filter((l) => !CLOSED.includes(l.status));
    const active = stages.filter((s) => s.active && s.category !== 'SPAM');
    const withViewing = leads.filter(hadViewing);
    const completedViewing = leads.filter((l) => l.viewings.some((v) => v.status === 'COMPLETED') || reached(l, 'VIEWED'));

    return {
      range: { from, to: new Date(to.getTime() - DAY) },
      currency: (await this.dev.get()).currency,
      totals: {
        leads: leads.length,
        contacted: leads.filter((l) => l.contactedAt).length,
        qualified: leads.filter((l) => reached(l, 'QUALIFIED')).length,
        viewings: withViewing.length,
        reserved: leads.filter((l) => reached(l, 'RESERVED')).length,
        won: leads.filter(won).length,
        lost: leads.filter((l) => l.status === 'LOST' || l.status === 'DISQUALIFIED').length,
        wonValueMinor: leads.filter(won).reduce((a, l) => a + valueOf(l), 0),
      },
      conversion: {
        leadToViewing: pct(withViewing.length, leads.length),
        viewingToCompleted: pct(completedViewing.length, withViewing.length),
        viewingToReserved: pct(withViewing.filter((l) => reached(l, 'RESERVED')).length, withViewing.length),
        reservationToSale: pct(reservations.filter((r) => r.status === 'CONVERTED').length, reservations.filter((r) => r.status !== 'ACTIVE').length),
        leadToSale: pct(leads.filter(won).length, leads.length),
      },
      funnel: ['NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING_SCHEDULED', 'VIEWED', 'NEGOTIATION', 'RESERVED', 'SOLD'].map((st) => ({ status: st, count: st === 'NEW' ? leads.length : leads.filter((l) => reached(l, st)).length })),
      bySource: group((l) => ({ key: l.leadSource, label: l.leadSource })),
      byAgent: group((l) => (l.assignedTo ? { key: l.assignedTo.id, label: l.assignedTo.name } : { key: 'none', label: 'Unassigned' })).map((r) => {
        const mine = leads.filter((l) => (l.assignedTo?.id ?? 'none') === r.key && l.contactedAt);
        return { ...r, medianResponseHours: round1(median(mine.map((l) => (l.contactedAt!.getTime() - l.createdAt.getTime()) / 3_600_000))) };
      }),
      byType: group((l) => {
        const t = typeOf(l);
        return t ? { key: t.id, label: t.name } : { key: 'none', label: 'Not specified' };
      }),
      byCampaign: group((l) => (l.campaign ? { key: l.campaign.id, label: l.campaign.name } : null)).map((r) => ({ ...r, budgetMinor: campaigns.find((c) => c.id === r.key)?.budgetMinor ?? null })),
      byResidence: [...byResidence.values()].sort((a, b) => b.leads - a.leads).slice(0, 15),
      byStage: active.map((s) => {
        const inStage = open.filter((l) => l.status === s.category);
        return { label: s.label, color: s.color, category: s.category, count: s.category === 'SOLD' ? leads.filter(won).length : inStage.length, valueMinor: inStage.reduce((a, l) => a + valueOf(l), 0) };
      }),
      lostReasons: Object.entries(leads.filter((l) => l.status === 'LOST').reduce<Record<string, number>>((m, l) => ((m[l.lostReason ?? 'UNKNOWN'] = (m[l.lostReason ?? 'UNKNOWN'] ?? 0) + 1), m), {})).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
      timeInStage: PIPELINE_STAGES.filter((s) => s !== 'SOLD').map((st) => {
        const xs = dwell.get(st) ?? [];
        return { status: st, avgHours: xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null, medianHours: round1(median(xs)), samples: xs.length };
      }),
      responseTime: {
        avgHours: responses.length ? round1(responses.reduce((a, b) => a + b, 0) / responses.length) : null,
        medianHours: round1(median(responses)),
        withinTarget: pct(responses.filter((h) => h <= FIRST_RESPONSE_HOURS).length, leads.length),
        targetHours: FIRST_RESPONSE_HOURS,
        neverContacted: leads.filter((l) => !l.contactedAt && l.status !== 'LOST').length,
      },
      followUps: { due: tasks.length, onTime, late, missed, onTimeRate: pct(onTime, onTime + late + missed) },
      trend: [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)),
    };
  }
}
