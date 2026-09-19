import { BadRequestException, Injectable } from '@nestjs/common';
import type { EnquiryStatus, LeadNoteKind, Prisma, PipelineStage } from '@avida/db';
import {
  can,
  computeLeadScore,
  DEFAULT_PIPELINE,
  isClosedStage,
  LEAD_SOURCE_LABEL,
  STAGE_LABEL,
  stageRank,
  temperatureFor,
  type LeadSourceValue,
  type ScoreBreakdown,
  type ScoringRuleSetting,
} from '@avida/types';
import { PrismaService } from './prisma.service.js';

type Tx = Prisma.TransactionClient;

export interface CrmActor {
  id: string;
  role: string;
}

/** The lead columns a stage move needs. */
export interface MovableLead {
  id: string;
  developmentId: string;
  status: EnquiryStatus;
  stageId: string | null;
  contactedAt: Date | null;
}

/** Kinds that mean someone actually spoke to the customer. */
const CONTACT_KINDS = new Set<LeadNoteKind>(['CALL', 'EMAIL', 'WHATSAPP', 'SMS', 'MEETING']);

export const unitCard = {
  id: true,
  code: true,
  status: true,
  priceMinor: true,
  currency: true,
  areaSqm: true,
  bedrooms: true,
  bathrooms: true,
  floor: { select: { id: true, label: true, displayName: true, level: true } },
  typology: { select: { id: true, name: true } },
} satisfies Prisma.UnitSelect;

/**
 * The CRM's rules in one place: which pipeline column a lead sits in, what a
 * move writes to its history, how the transparent score is computed, who a new
 * lead goes to, and who hears about what. Controllers call this; they never
 * write a stage or a score by hand.
 */
@Injectable()
export class CrmService {
  private readonly seeded = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  // ─── Visibility ────────────────────────────────────────────────────────

  /** Agents see their own leads and the unassigned pool; managers see every lead. */
  leadScope(actor: CrmActor): Prisma.EnquiryWhereInput {
    return can(actor.role, 'enquiry.view-all') ? {} : { OR: [{ assignedToId: actor.id }, { assignedToId: null }] };
  }

  // ─── Pipeline ──────────────────────────────────────────────────────────

  /** Creates the default pipeline once, and files any lead without a column into the first one of its category. */
  async ensureStages(developmentId: string): Promise<void> {
    if (!this.seeded.has(developmentId)) {
      const count = await this.prisma.client.pipelineStage.count({ where: { developmentId } });
      if (!count) {
        await this.prisma.client.pipelineStage.createMany({
          data: DEFAULT_PIPELINE.map((s, position) => ({ developmentId, label: s.label, category: s.category as EnquiryStatus, color: s.color, probability: s.probability, position })),
        });
      }
      this.seeded.add(developmentId);
    }
    const orphans = await this.prisma.client.enquiry.groupBy({ by: ['status'], where: { developmentId, stageId: null }, _count: true });
    if (!orphans.length) return;
    const stages = await this.stages(developmentId);
    for (const o of orphans) {
      const stage = this.firstOf(stages, o.status);
      if (stage) await this.prisma.client.enquiry.updateMany({ where: { developmentId, stageId: null, status: o.status }, data: { stageId: stage.id } });
    }
  }

  stages(developmentId: string, db: Tx | PrismaService['client'] = this.prisma.client): Promise<PipelineStage[]> {
    return db.pipelineStage.findMany({ where: { developmentId }, orderBy: { position: 'asc' } });
  }

  /** The first active column of a category (falling back to an inactive one, so a lead is never column-less). */
  firstOf(stages: PipelineStage[], category: string): PipelineStage | undefined {
    return stages.find((s) => s.category === category && s.active) ?? stages.find((s) => s.category === category);
  }

  /** A lead's column, trusting stageId only when it agrees with the status (an old writer may have moved only the status). */
  effectiveStage(stages: PipelineStage[], lead: { stageId: string | null; status: string }): PipelineStage | undefined {
    const own = lead.stageId ? stages.find((s) => s.id === lead.stageId) : undefined;
    return own && own.category === lead.status ? own : this.firstOf(stages, lead.status);
  }

  /**
   * Moves a lead to a column (by id) or to the first column of a category.
   * Writes the stage history and a timeline entry. With `forwardOnly`, an
   * automatic move (a viewing, a reservation) never drags a lead backwards
   * and never reopens a closed or parked one. Returns whether it moved.
   */
  async moveLead(tx: Tx, lead: MovableLead, target: { stageId?: string; status?: string }, actorId: string | null, opts: { forwardOnly?: boolean; reason?: string; bulk?: boolean } = {}): Promise<boolean> {
    const stages = await this.stages(lead.developmentId, tx);
    const to = target.stageId ? stages.find((s) => s.id === target.stageId) : target.status ? this.firstOf(stages, target.status) : undefined;
    if (!to) throw new BadRequestException('That pipeline stage does not exist.');
    if (target.stageId && !to.active) throw new BadRequestException(`The “${to.label}” stage is switched off.`);
    const from = this.effectiveStage(stages, lead);
    if (from?.id === to.id && lead.status === to.category) return false;
    if (opts.forwardOnly) {
      if (isClosedStage(lead.status) || lead.status === 'ON_HOLD') return false;
      if (stageRank(to.category) <= stageRank(lead.status)) return false;
    }
    const now = new Date();
    await tx.enquiry.update({
      where: { id: lead.id },
      data: {
        stageId: to.id,
        status: to.category,
        stageChangedAt: now,
        lastActivityAt: now,
        // §15.3 — the first move off New is the first response.
        ...(!lead.contactedAt && lead.status === 'NEW' && to.category !== 'SPAM' ? { contactedAt: now } : {}),
      },
    });
    await tx.leadStageChange.create({ data: { enquiryId: lead.id, fromStageId: from?.id ?? null, toStageId: to.id, fromStatus: lead.status, toStatus: to.category, actorId } });
    await tx.leadNote.create({
      data: {
        enquiryId: lead.id,
        authorId: actorId,
        kind: 'STATUS',
        body: `${from?.label ?? STAGE_LABEL[lead.status] ?? lead.status} → ${to.label}${opts.reason ? ` (${opts.reason})` : ''}${opts.bulk ? ' · bulk' : ''}`,
        meta: { from: lead.status, to: to.category, fromStageId: from?.id ?? null, toStageId: to.id },
      },
    });
    return true;
  }

  // ─── Timeline ──────────────────────────────────────────────────────────

  async logActivity(
    tx: Tx | PrismaService['client'],
    enquiryId: string,
    kind: LeadNoteKind,
    body: string,
    actorId: string | null,
    extra: { meta?: Prisma.InputJsonValue; direction?: 'IN' | 'OUT' | null; durationMin?: number | null } = {},
  ) {
    const now = new Date();
    const note = await tx.leadNote.create({
      data: { enquiryId, authorId: actorId, kind, body, meta: extra.meta, direction: extra.direction ?? null, durationMin: extra.durationMin ?? null },
      include: { author: { select: { name: true } } },
    });
    await tx.enquiry.update({ where: { id: enquiryId }, data: { lastActivityAt: now, ...(CONTACT_KINDS.has(kind) ? { lastContactAt: now } : {}) } });
    return note;
  }

  /** A lead's next follow-up is its earliest open task with a due date. */
  async syncFollowUp(tx: Tx | PrismaService['client'], enquiryId: string): Promise<void> {
    const next = await tx.leadTask.findFirst({ where: { enquiryId, status: 'OPEN', dueAt: { not: null } }, orderBy: { dueAt: 'asc' }, select: { dueAt: true } });
    await tx.enquiry.update({ where: { id: enquiryId }, data: { followUpAt: next?.dueAt ?? null } });
  }

  // ─── Scoring ───────────────────────────────────────────────────────────

  async settings(developmentId: string) {
    return this.prisma.client.crmSettings.upsert({ where: { developmentId }, create: { developmentId }, update: {} });
  }

  /** Computes the score with its reasons, and stores the number for sorting. */
  async rescore(enquiryId: string): Promise<(ScoreBreakdown & { temperature: string }) | null> {
    const since = new Date(Date.now() - 14 * 86_400_000);
    const lead = await this.prisma.client.enquiry.findUnique({
      where: { id: enquiryId },
      include: {
        units: { include: { unit: { select: { priceMinor: true } } } },
        primaryUnit: { select: { priceMinor: true } },
        viewings: { select: { status: true } },
        deals: { where: { status: { in: ['NEGOTIATION', 'RESERVED', 'CONTRACT'] } }, select: { id: true } },
        notes: { where: { createdAt: { gte: since }, OR: [{ direction: 'IN' }, { kind: { in: ['CALL', 'MEETING'] } }] }, select: { id: true }, take: 1 },
      },
    });
    if (!lead) return null;
    const settings = await this.settings(lead.developmentId);
    const prices = lead.units.map((u) => u.unit.priceMinor);
    const result = computeLeadScore(
      {
        budgetMaxMinor: lead.budgetMaxMinor,
        targetPriceMinor: lead.primaryUnit?.priceMinor ?? (prices.length ? Math.min(...prices) : null),
        budgetConfirmed: lead.budgetConfirmed,
        hasResidence: Boolean(lead.primaryUnitId) || lead.units.length > 0,
        hasRequirements: Boolean(lead.typologyId || lead.bedrooms !== null || lead.sizeMinSqm !== null || lead.budgetMaxMinor !== null),
        viewingBooked: lead.viewings.some((v) => ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'].includes(v.status)),
        viewingCompleted: lead.viewings.some((v) => v.status === 'COMPLETED'),
        responsive: lead.repeatCount > 0 && lead.lastActivityAt !== null && lead.lastActivityAt >= since ? true : lead.notes.length > 0,
        timeline: lead.timeline,
        financingRequired: lead.financingRequired,
        decisionMaker: lead.decisionMaker,
        repeatCount: lead.repeatCount,
        leadSource: lead.leadSource,
        openDeal: lead.deals.length > 0,
        lastActivityAt: lead.lastActivityAt,
        createdAt: lead.createdAt,
      },
      settings.scoringRules as ScoringRuleSetting[] | null,
    );
    if (result.score !== lead.score) await this.prisma.client.enquiry.update({ where: { id: enquiryId }, data: { score: result.score } });
    return { ...result, temperature: temperatureFor(result.score, lead.temperature, { hot: settings.hotThreshold, warm: settings.warmThreshold }) };
  }

  // ─── Assignment ────────────────────────────────────────────────────────

  /** Who a new website lead goes to, by the configured rule. Null leaves it in the unassigned pool. */
  async autoAssign(developmentId: string): Promise<string | null> {
    const settings = await this.settings(developmentId);
    if (settings.assignmentMode === 'MANUAL') return null;
    const users = await this.prisma.client.adminUser.findMany({
      where: { active: true, ...(settings.assignmentPool.length ? { id: { in: settings.assignmentPool } } : { role: { in: ['SALES_AGENT', 'SALES_MANAGER'] } }) },
      select: { id: true, role: true },
      orderBy: { createdAt: 'asc' },
    });
    const pool = users.filter((u) => can(u.role, 'enquiry.edit'));
    if (!pool.length) return null;
    if (settings.assignmentMode === 'ROUND_ROBIN') {
      // Increment first, so two leads arriving together never take the same turn.
      const next = await this.prisma.client.crmSettings.update({ where: { developmentId }, data: { roundRobinCursor: { increment: 1 } }, select: { roundRobinCursor: true } });
      return pool[(next.roundRobinCursor - 1) % pool.length]!.id;
    }
    const loads = await this.prisma.client.enquiry.groupBy({
      by: ['assignedToId'],
      where: { developmentId, archivedAt: null, assignedToId: { in: pool.map((u) => u.id) }, status: { notIn: ['SOLD', 'LOST', 'DISQUALIFIED', 'SPAM'] } },
      _count: true,
    });
    const load = new Map(loads.map((l) => [l.assignedToId, l._count]));
    return [...pool].sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0))[0]!.id;
  }

  // ─── In-app notifications ──────────────────────────────────────────────

  async managerIds(): Promise<string[]> {
    const rows = await this.prisma.client.adminUser.findMany({ where: { active: true, role: { in: ['SUPER_ADMIN', 'SALES_MANAGER'] } }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  /** One bell entry per person; never to the person who caused it. A dedupe key makes a repeat a no-op. */
  async notify(userIds: (string | null | undefined)[], n: { kind: string; title: string; body?: string | null; link?: string | null; enquiryId?: string | null; dedupeKey?: string }, exceptId?: string | null): Promise<void> {
    const ids = [...new Set(userIds.filter((id): id is string => Boolean(id) && id !== exceptId))];
    if (!ids.length) return;
    await this.prisma.client.adminNotification.createMany({
      data: ids.map((userId) => ({ userId, kind: n.kind, title: n.title, body: n.body ?? null, link: n.link ?? null, enquiryId: n.enquiryId ?? null, dedupeKey: n.dedupeKey ? `${n.dedupeKey}:${userId}` : null })),
      skipDuplicates: true,
    });
  }

  // ─── Contacts ──────────────────────────────────────────────────────────

  /** Finds or creates the contact (client) for a lead, and links them. */
  async linkBuyer(tx: Tx, lead: { id: string; developmentId: string; name: string; email: string | null; phone: string | null; countryIso: string | null; leadSource: string; assignedToId: string | null; buyerId: string | null }, actorId: string) {
    if (lead.buyerId) return tx.buyer.findUniqueOrThrow({ where: { id: lead.buyerId } });
    const existing = await tx.buyer.findFirst({
      where: { developmentId: lead.developmentId, archivedAt: null, OR: [...(lead.email ? [{ email: { equals: lead.email, mode: 'insensitive' as const } }] : []), ...(lead.phone ? [{ phone: lead.phone }] : [])] },
    });
    const units = await tx.enquiryUnit.findMany({ where: { enquiryId: lead.id } });
    const b =
      existing ??
      (await tx.buyer.create({
        data: {
          developmentId: lead.developmentId,
          fullName: lead.name,
          email: lead.email,
          phone: lead.phone,
          countryIso: lead.countryIso,
          stage: units.length ? 'INTERESTED' : 'ENQUIRY',
          source: LEAD_SOURCE_LABEL[lead.leadSource as LeadSourceValue] ?? lead.leadSource,
          assignedToId: lead.assignedToId,
        },
      }));
    for (const u of units) await tx.buyerInterest.upsert({ where: { buyerId_unitId: { buyerId: b.id, unitId: u.unitId } }, create: { buyerId: b.id, unitId: u.unitId }, update: {} });
    await tx.enquiry.update({ where: { id: lead.id }, data: { buyerId: b.id, lastActivityAt: new Date() } });
    await tx.leadNote.create({ data: { enquiryId: lead.id, authorId: actorId, kind: 'SYSTEM', body: existing ? `Linked to existing contact ${b.fullName}.` : `Became contact ${b.fullName}.` } });
    return b;
  }

  // ─── Inventory awareness ───────────────────────────────────────────────

  /**
   * Available residences like the one a lead wants: same type and bedrooms
   * first, then size and price within about ten per cent, then a nearby floor.
   */
  async similarUnits(
    developmentId: string,
    want: { unitId?: string | null; typologyId?: string | null; bedrooms?: number | null; areaSqm?: number | null; priceMinor?: number | null; budgetMaxMinor?: number | null; level?: number | null },
    exclude: string[] = [],
    take = 5,
  ) {
    const candidates = await this.prisma.client.unit.findMany({
      where: { developmentId, status: 'AVAILABLE', archivedAt: null, id: { notIn: exclude } },
      select: unitCard,
    });
    const within = (a: number | null | undefined, b: number | null | undefined, pct: number) => a != null && b != null && b > 0 && Math.abs(a - b) / b <= pct;
    return candidates
      .map((u) => {
        let score = 0;
        const reasons: string[] = [];
        if (want.typologyId && u.typology.id === want.typologyId) (score += 3), reasons.push('Same type');
        if (want.bedrooms != null) {
          if (u.bedrooms === want.bedrooms) (score += 3), reasons.push(`${u.bedrooms} bedrooms`);
          else if (Math.abs(u.bedrooms - want.bedrooms) === 1) score += 1;
        }
        if (within(u.areaSqm, want.areaSqm, 0.1)) (score += 2), reasons.push('Similar size');
        if (want.budgetMaxMinor != null && u.priceMinor <= want.budgetMaxMinor) (score += 2), reasons.push('Within budget');
        else if (within(u.priceMinor, want.priceMinor, 0.1)) (score += 2), reasons.push('Similar price');
        if (want.level != null && Math.abs(u.floor.level - want.level) <= 1) (score += 1), reasons.push('Nearby floor');
        return { ...u, match: score, reasons };
      })
      .filter((u) => u.match >= 3)
      .sort((a, b) => b.match - a.match || a.priceMinor - b.priceMinor)
      .slice(0, take);
  }

  /** What a lead is worth to the pipeline: its deal, else the residence it wants, else its budget. */
  valueOf(lead: { budgetMaxMinor: number | null; primaryUnit?: { priceMinor: number } | null; units?: { priceMinor: number }[]; deals?: { agreedPriceMinor: number | null; listPriceMinor: number; status: string }[] }): number {
    const deal = lead.deals?.find((d) => ['NEGOTIATION', 'RESERVED', 'CONTRACT', 'SOLD'].includes(d.status));
    if (deal) return deal.agreedPriceMinor ?? deal.listPriceMinor;
    if (lead.primaryUnit) return lead.primaryUnit.priceMinor;
    if (lead.units?.length) return Math.min(...lead.units.map((u) => u.priceMinor));
    return lead.budgetMaxMinor ?? 0;
  }
}
