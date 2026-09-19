import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, Patch, Post, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import type { ApprovalStatus, DealStatus, LostReason, Prisma } from '@avida/db';
import { APPROVAL_KIND_LABEL, APPROVAL_KINDS, APPROVAL_PERMISSION, can, DEAL_STATUS_LABEL, effectivePriceMinor, formatMoney, LOST_REASON_LABEL, type ApprovalKind, type DealStatusValue, type LostReasonValue } from '@avida/types';
import { AccessService } from '../../common/access.service.js';
import { AuditService } from '../../common/audit.service.js';
import { CrmService, unitCard, type RecordPermission } from '../../common/crm.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { PrismaService } from '../../common/prisma.service.js';
import { PublicSync } from '../../common/public-sync.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf, assertCan, type Actor } from './actor.js';
import { ApprovalDecisionDto, ApprovalRequestDto, CreateDealDto, DealActionDto, DealFieldsDto } from './crm.dto.js';
import { ReservationService } from './reservation.service.js';

const include = {
  unit: { select: { ...unitCard, discountMinor: true, promoPriceMinor: true, promoEndsAt: true } },
  enquiry: { select: { id: true, name: true, phone: true, email: true, status: true, assignedToId: true } },
  buyer: { select: { id: true, fullName: true } },
  agent: { select: { id: true, name: true } },
  paymentPlan: { select: { id: true, name: true } },
  reservation: { select: { id: true, status: true, heldUntil: true, depositMinor: true, depositReceivedAt: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.DealInclude;

const approvalInclude = {
  requestedBy: { select: { id: true, name: true } },
  decidedBy: { select: { id: true, name: true } },
} satisfies Prisma.ApprovalRequestInclude;

const OPEN: DealStatus[] = ['NEGOTIATION', 'RESERVED', 'CONTRACT'];
const money = (minor: number | null | undefined, currency: string) => (minor == null ? '—' : formatMoney({ amountMinor: minor, currency }));

/**
 * §13 / CRM — a deal is one lead negotiating one residence. It carries the
 * list price at the time, the agreed price and discount (only `deal.price`
 * may set them, and every change is audited with before and after), the
 * payment plan and reservation amount, and it moves through
 * Negotiation → Reserved → Contract → Sold. The residence's status changes
 * only through the reservation service, never by hand.
 */
@Controller('admin/crm/deals')
@UseGuards(AdminGuard)
@RequirePermission('enquiry.view')
@UseInterceptors(NoStoreInterceptor)
export class DealsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly audit: AuditService,
    private readonly crm: CrmService,
    private readonly reservations: ReservationService,
    private readonly sync: PublicSync,
    private readonly access: AccessService,
  ) {}

  /** Reads follow the `enquiry.view` scope; changes follow `deal.edit`. */
  private scope(actor: Actor, p: RecordPermission = 'enquiry.view'): Prisma.DealWhereInput {
    return this.crm.dealScope(actor, p);
  }

  /**
   * Field-level access, enforced here rather than hidden in the admin:
   * deposits and reservation amounts need `finance.view` or the authority to
   * set prices. Everyone who can see a deal sees its list and agreed price —
   * they negotiate it.
   */
  private finance<T extends { reservationAmountMinor?: number | null; reservation?: { depositMinor: number | null } | null }>(actor: Actor, d: T): T & { financeHidden?: boolean } {
    if (can(actor, 'finance.view') || can(actor, 'deal.price')) return d;
    return { ...d, reservationAmountMinor: null, ...(d.reservation ? { reservation: { ...d.reservation, depositMinor: null } } : {}), financeHidden: true };
  }

  @Get()
  async list(@Req() req: AdminRequest, @Query('status') status?: string, @Query('agentId') agentId?: string, @Query('q') q?: string, @Query('unitId') unitId?: string) {
    const actor = actorOf(req);
    const developmentId = await this.dev.id();
    const base: Prisma.DealWhereInput = { AND: [{ developmentId, archivedAt: null }, this.scope(actor)] };
    const where: Prisma.DealWhereInput = {
      AND: [
        base,
        status === 'open' || !status ? { status: { in: OPEN } } : status === 'all' ? {} : { status: { in: status.split(',') as DealStatus[] } },
        agentId ? { agentId: agentId === 'me' ? actor.id : agentId } : {},
        unitId ? { unitId } : {},
        q?.trim() ? { OR: [{ enquiry: { name: { contains: q.trim(), mode: 'insensitive' } } }, { buyer: { fullName: { contains: q.trim(), mode: 'insensitive' } } }, { unit: { code: { contains: q.trim().replace(/\s+/g, '-'), mode: 'insensitive' } } }] } : {},
      ],
    };
    const [rows, totals] = await Promise.all([
      this.prisma.client.deal.findMany({ where, include, orderBy: [{ updatedAt: 'desc' }], take: 500 }),
      this.prisma.client.deal.findMany({ where: base, select: { status: true, agreedPriceMinor: true, listPriceMinor: true, discountMinor: true } }),
    ]);
    const summary = Object.fromEntries(
      (['NEGOTIATION', 'RESERVED', 'CONTRACT', 'SOLD', 'LOST', 'CANCELLED'] as DealStatusValue[]).map((s) => {
        const inStatus = totals.filter((t) => t.status === s);
        return [s, { count: inStatus.length, valueMinor: inStatus.reduce((a, t) => a + (t.agreedPriceMinor ?? t.listPriceMinor), 0), discountMinor: inStatus.reduce((a, t) => a + (t.discountMinor ?? 0), 0) }];
      }),
    );
    const seesMoney = can(actor, 'finance.view') || can(actor, 'deal.price');
    return { data: rows.map((r) => this.finance(actor, r)), summary: seesMoney ? summary : Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, { ...v, discountMinor: null }])) };
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const deal = await this.owned(id, actor, 'enquiry.view');
    const [tasks, documents, audit, approvals] = await Promise.all([
      this.prisma.client.leadTask.findMany({ where: { dealId: id }, orderBy: [{ status: 'asc' }, { dueAt: 'asc' }], include: { assignedTo: { select: { name: true } } } }),
      can(actorOf(req), 'crm.documents') ? this.prisma.client.leadDocument.findMany({ where: { dealId: id, archivedAt: null }, orderBy: { createdAt: 'desc' }, select: { id: true, kind: true, name: true, mimeType: true, sizeBytes: true, sentAt: true, createdAt: true } }) : Promise.resolve([]),
      this.prisma.client.adminAuditLog.findMany({ where: { entity: 'deal', entityId: id }, orderBy: { createdAt: 'desc' }, take: 50, include: { actor: { select: { name: true } } } }),
      this.prisma.client.approvalRequest.findMany({ where: { entity: 'deal', entityId: id }, orderBy: { createdAt: 'desc' }, take: 20, include: approvalInclude }),
    ]);
    return {
      ...this.finance(actor, deal),
      tasks,
      documents,
      history: audit.map(({ actor: who, ...a }) => ({ ...a, actorName: who.name })),
      approvals: approvals.map((a) => this.approvalView(actor, a)),
      // What this person may do directly; anything else goes through a request.
      mayDirectly: { price: can(actor, 'deal.price'), reserve: can(actor, 'reservation.edit'), close: can(actor, 'deal.close') },
    };
  }

  @Post()
  @RequirePermission('deal.edit')
  async create(@Body() dto: CreateDealDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const developmentId = await this.dev.id();
    const lead = await this.prisma.client.enquiry.findFirst({ where: { AND: [{ id: dto.enquiryId, developmentId, archivedAt: null }, this.crm.leadScope(actor, 'deal.edit')] } });
    if (!lead) throw new NotFoundException('No such lead, or it belongs to another agent.');
    const unit = await this.prisma.client.unit.findFirst({ where: { id: dto.unitId, developmentId, archivedAt: null } });
    if (!unit) throw new BadRequestException('That residence does not exist on this property.');
    if (unit.status === 'SOLD' || unit.status === 'UNAVAILABLE') throw new ConflictException(`${unit.code} is ${unit.status.toLowerCase()}, so it cannot be negotiated.`);
    if (await this.prisma.client.deal.count({ where: { enquiryId: lead.id, unitId: unit.id, status: { in: OPEN } } })) throw new ConflictException(`${lead.name} already has an open deal on ${unit.code}.`);
    const listPriceMinor = effectivePriceMinor(unit);
    this.assertPricing(actor, dto, listPriceMinor);
    await this.assertRefs(developmentId, dto);
    const deal = await this.prisma.client.$transaction(async (tx) => {
      const buyer = await this.crm.linkBuyer(tx, lead, actor.id);
      const d = await tx.deal.create({
        data: {
          developmentId,
          enquiryId: lead.id,
          buyerId: buyer.id,
          unitId: unit.id,
          agentId: dto.agentId ?? lead.assignedToId ?? actor.id,
          listPriceMinor,
          currency: unit.currency,
          ...this.fields(dto, listPriceMinor),
          createdById: actor.id,
        },
        include,
      });
      await tx.enquiryUnit.upsert({ where: { enquiryId_unitId: { enquiryId: lead.id, unitId: unit.id } }, create: { enquiryId: lead.id, unitId: unit.id }, update: {} });
      if (!lead.primaryUnitId) await tx.enquiry.update({ where: { id: lead.id }, data: { primaryUnitId: unit.id } });
      await this.crm.moveLead(tx, lead, { status: 'NEGOTIATION' }, actor.id, { forwardOnly: true, reason: `deal on ${unit.code}` });
      await this.crm.logActivity(tx, lead.id, 'DEAL', `Deal opened on ${unit.code} · list ${money(listPriceMinor, unit.currency)}${d.agreedPriceMinor !== null ? ` · agreed ${money(d.agreedPriceMinor, unit.currency)}` : ''}`, actor.id, { meta: { dealId: d.id, unitId: unit.id } });
      return d;
    });
    await this.audit.record({ actorId: actor.id, action: 'deal.create', entity: 'deal', entityId: deal.id, target: `${lead.name} · ${unit.code}`, summary: `Opened a deal: ${lead.name} on ${unit.code}`, after: { listPriceMinor, agreedPriceMinor: deal.agreedPriceMinor, discountMinor: deal.discountMinor }, req });
    await this.crm.rescore(lead.id);
    return this.finance(actor, deal);
  }

  @Patch(':id')
  @RequirePermission('deal.edit')
  async update(@Param('id') id: string, @Body() dto: DealFieldsDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const before = await this.owned(id, actor, 'deal.edit');
    const closed = !OPEN.includes(before.status);
    const touchesTerms = (['agreedPriceMinor', 'discountMinor', 'reservationAmountMinor', 'paymentPlanId', 'expectedCloseAt', 'contractSignedAt', 'agentId'] as const).some((k) => dto[k] !== undefined);
    if (closed && touchesTerms) throw new ConflictException(`This deal is ${DEAL_STATUS_LABEL[before.status as DealStatusValue].toLowerCase()}; only its notes can change.`);
    this.assertPricing(actor, dto, before.listPriceMinor, before);
    await this.assertRefs(before.developmentId, dto);
    if (dto.agentId !== undefined && dto.agentId !== before.agentId && dto.agentId !== actor.id) assertCan(actor, 'enquiry.assign');
    const after = await this.prisma.client.deal.update({ where: { id }, data: { ...this.fields(dto, before.listPriceMinor, before), ...(dto.notes !== undefined ? { notes: dto.notes } : {}) }, include });
    const keys = ['agreedPriceMinor', 'discountMinor', 'reservationAmountMinor', 'paymentPlanId', 'expectedCloseAt', 'contractSignedAt', 'agentId'] as const;
    const changed = keys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    if (changed.length) {
      const priceLine = changed.includes('agreedPriceMinor') ? `agreed price ${money(before.agreedPriceMinor, before.currency)} → ${money(after.agreedPriceMinor, after.currency)}` : null;
      const discountLine = changed.includes('discountMinor') ? `discount ${money(before.discountMinor, before.currency)} → ${money(after.discountMinor, after.currency)}` : null;
      const summary = [priceLine, discountLine, ...changed.filter((k) => k !== 'agreedPriceMinor' && k !== 'discountMinor')].filter(Boolean).join(', ');
      await this.audit.record({ actorId: actor.id, action: changed.some((k) => k === 'agreedPriceMinor' || k === 'discountMinor') ? 'deal.price' : 'deal.update', entity: 'deal', entityId: id, target: `${before.enquiry?.name ?? 'Deal'} · ${before.unit.code}`, summary: `Deal ${before.unit.code}: ${summary}`, before: Object.fromEntries(changed.map((k) => [k, before[k]])), after: Object.fromEntries(changed.map((k) => [k, after[k]])), req });
      if (before.enquiryId) await this.crm.logActivity(this.prisma.client, before.enquiryId, 'DEAL', `Deal on ${before.unit.code}: ${summary}`, actor.id, { meta: { dealId: id } });
    }
    return this.finance(actor, after);
  }

  /** Reserve, move to contract, mark sold or lost, cancel, or reopen. */
  @Post(':id/action')
  @HttpCode(200)
  @RequirePermission('deal.edit')
  async action(@Param('id') id: string, @Body() dto: DealActionDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const deal = await this.owned(id, actor, 'deal.edit');
    const target = `${deal.enquiry?.name ?? 'Deal'} · ${deal.unit.code}`;
    const from = deal.status;
    let summary = '';
    let inventoryChanged = false;

    switch (dto.action) {
      case 'reserve': {
        assertCan(actor, 'reservation.edit');
        if (from !== 'NEGOTIATION') throw new ConflictException('Only a deal in negotiation can be reserved.');
        await this.prisma.client.$transaction(async (tx) => {
          const r = await this.reservations.hold(tx, { developmentId: deal.developmentId, unitId: deal.unitId, buyerId: deal.buyerId, enquiryId: deal.enquiryId, agentId: deal.agentId, heldUntil: dto.heldUntil ?? null, depositMinor: dto.depositMinor ?? deal.reservationAmountMinor, notes: dto.note ?? null }, actor.id);
          await tx.deal.update({ where: { id }, data: { status: 'RESERVED', reservationId: r.id, ...(dto.depositMinor !== undefined ? { reservationAmountMinor: dto.depositMinor } : {}) } });
        });
        summary = `Reserved ${deal.unit.code} for ${deal.enquiry?.name ?? 'the buyer'}`;
        inventoryChanged = true;
        break;
      }
      case 'contract': {
        if (from !== 'RESERVED') throw new ConflictException('Reserve the residence before moving to contract.');
        await this.prisma.client.$transaction(async (tx) => {
          await tx.deal.update({ where: { id }, data: { status: 'CONTRACT', contractSignedAt: deal.contractSignedAt ?? null } });
          if (deal.enquiryId) {
            const lead = await tx.enquiry.findUniqueOrThrow({ where: { id: deal.enquiryId } });
            await this.crm.moveLead(tx, lead, { status: 'CONTRACT' }, actor.id, { forwardOnly: true, reason: `contract for ${deal.unit.code}` });
            await this.crm.logActivity(tx, deal.enquiryId, 'DEAL', `Deal on ${deal.unit.code} moved to contract / documentation`, actor.id, { meta: { dealId: id } });
          }
        });
        summary = `Moved the deal on ${deal.unit.code} to contract`;
        break;
      }
      case 'sold': {
        assertCan(actor, 'deal.close');
        if (!OPEN.includes(from)) throw new ConflictException('This deal is already closed.');
        const others = await this.prisma.client.$transaction(async (tx) => {
          let reservationId = deal.reservation?.status === 'ACTIVE' ? deal.reservation.id : null;
          // A cash sale with no hold first: place the hold and convert it in one step.
          if (!reservationId) {
            const r = await this.reservations.hold(tx, { developmentId: deal.developmentId, unitId: deal.unitId, buyerId: deal.buyerId, enquiryId: deal.enquiryId, agentId: deal.agentId, depositMinor: deal.reservationAmountMinor }, actor.id);
            await tx.deal.update({ where: { id }, data: { reservationId: r.id, status: 'RESERVED' } });
            reservationId = r.id;
          }
          await this.reservations.close(tx, reservationId, 'convert', actor.id, dto.note ?? null);
          await tx.deal.update({ where: { id }, data: { status: 'SOLD', closedAt: new Date() } });
          // Everyone else negotiating this home has lost it.
          const rivals = await tx.deal.findMany({ where: { unitId: deal.unitId, id: { not: id }, status: { in: OPEN } }, select: { id: true, enquiryId: true, agentId: true } });
          for (const r of rivals) {
            await tx.deal.update({ where: { id: r.id }, data: { status: 'LOST', lostReason: 'OTHER', lostNote: `${deal.unit.code} was sold to another buyer.`, closedAt: new Date() } });
            if (r.enquiryId) await this.crm.logActivity(tx, r.enquiryId, 'DEAL', `${deal.unit.code} was sold to another buyer — the deal is closed. Offer an alternative.`, actor.id, { meta: { dealId: r.id } });
          }
          return rivals;
        });
        if (others.length) await this.crm.notify(others.map((o) => o.agentId), { kind: 'deal.lost', title: `${deal.unit.code} sold to another buyer`, body: 'Your deal on it was closed. Offer the client a similar residence.', link: '/crm/deals?status=LOST' }, actor.id);
        summary = `Closed the sale of ${deal.unit.code} to ${deal.enquiry?.name ?? 'the buyer'} at ${money(deal.agreedPriceMinor ?? deal.listPriceMinor, deal.currency)}`;
        inventoryChanged = true;
        break;
      }
      case 'lost':
      case 'cancel': {
        if (!OPEN.includes(from)) throw new ConflictException('This deal is already closed.');
        if (dto.action === 'lost' && !dto.lostReason) throw new BadRequestException('Say why the deal was lost.');
        if (deal.reservation?.status === 'ACTIVE') assertCan(actor, 'reservation.edit');
        await this.prisma.client.$transaction(async (tx) => {
          if (deal.reservation?.status === 'ACTIVE') {
            await this.reservations.close(tx, deal.reservation.id, 'cancel', actor.id, dto.note ?? (dto.action === 'lost' ? 'Deal lost' : 'Deal cancelled'));
            inventoryChanged = true;
          }
          await tx.deal.update({ where: { id }, data: { status: dto.action === 'lost' ? 'LOST' : 'CANCELLED', lostReason: (dto.lostReason as LostReason) ?? null, lostNote: dto.note ?? null, closedAt: new Date(), reservationId: null } });
          if (deal.enquiryId) await this.crm.logActivity(tx, deal.enquiryId, 'DEAL', `Deal on ${deal.unit.code} ${dto.action === 'lost' ? `lost (${LOST_REASON_LABEL[dto.lostReason as LostReasonValue]})` : 'cancelled'}${dto.note ? `: ${dto.note}` : ''}`, actor.id, { meta: { dealId: id } });
        });
        summary = `${dto.action === 'lost' ? 'Lost' : 'Cancelled'} the deal on ${deal.unit.code}`;
        break;
      }
      case 'reopen': {
        if (from !== 'LOST' && from !== 'CANCELLED') throw new ConflictException('Only a lost or cancelled deal can be reopened.');
        const unit = await this.prisma.client.unit.findUniqueOrThrow({ where: { id: deal.unitId }, select: { status: true, code: true } });
        if (unit.status === 'SOLD') throw new ConflictException(`${unit.code} has been sold; the deal cannot be reopened.`);
        await this.prisma.client.$transaction(async (tx) => {
          await tx.deal.update({ where: { id }, data: { status: 'NEGOTIATION', closedAt: null, lostReason: null, lostNote: null } });
          if (deal.enquiryId) await this.crm.logActivity(tx, deal.enquiryId, 'DEAL', `Deal on ${deal.unit.code} reopened`, actor.id, { meta: { dealId: id } });
        });
        summary = `Reopened the deal on ${deal.unit.code}`;
        break;
      }
    }
    const after = await this.prisma.client.deal.findUniqueOrThrow({ where: { id }, select: { status: true } });
    await this.audit.record({ actorId: actor.id, action: `deal.${dto.action}`, entity: 'deal', entityId: id, target, summary, before: { status: from }, after: { status: after.status }, req });
    if (deal.enquiryId) await this.crm.rescore(deal.enquiryId);
    if (dto.action === 'sold' || dto.action === 'reserve') {
      await this.crm.notify([...(await this.crm.managerIds()), deal.agentId], { kind: `deal.${dto.action}`, title: dto.action === 'sold' ? `Sold: ${deal.unit.code}` : `Reserved: ${deal.unit.code}`, body: `${deal.enquiry?.name ?? 'Buyer'} · ${actor.name}`, link: deal.enquiryId ? `/crm/leads/${deal.enquiryId}` : '/crm/deals', enquiryId: deal.enquiryId }, actor.id);
    }
    if (inventoryChanged) await this.sync.changed('inventory');
    return this.get(id, req);
  }

  // ─── Approvals ─────────────────────────────────────────────────────────
  //
  // An agent who may not agree a discount, reserve or close a sale asks
  // someone who may. Approving replays the exact change through update() or
  // action() as the approver, so every rule and audit row is the same as if
  // the approver had done it themselves. Nobody approves their own request.

  /** Requests the person may decide (and their own), newest first. */
  @Get('approvals')
  async approvals(@Req() req: AdminRequest, @Query('status') status?: string) {
    const actor = actorOf(req);
    const decidable = APPROVAL_KINDS.filter((k) => can(actor, APPROVAL_PERMISSION[k]));
    const wanted = status === 'all' ? undefined : ((status?.toUpperCase() || 'PENDING') as ApprovalStatus);
    const rows = await this.prisma.client.approvalRequest.findMany({
      where: {
        developmentId: await this.dev.id(),
        entity: 'deal',
        ...(wanted ? { status: wanted } : {}),
        OR: [{ requestedById: actor.id }, ...(decidable.length ? [{ kind: { in: decidable } }] : [])],
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: approvalInclude,
    });
    // Only requests on deals the person's own scope reaches.
    const deals = await this.prisma.client.deal.findMany({
      where: { AND: [{ id: { in: [...new Set(rows.map((r) => r.entityId))] } }, this.scope(actor)] },
      select: { id: true, listPriceMinor: true, agreedPriceMinor: true, currency: true, status: true, unit: { select: { code: true } }, enquiry: { select: { id: true, name: true } } },
    });
    const byId = new Map(deals.map((d) => [d.id, d]));
    return rows.filter((r) => r.requestedById === actor.id || byId.has(r.entityId)).map((r) => ({ ...this.approvalView(actor, r), deal: byId.get(r.entityId) ?? null }));
  }

  @Post(':id/approvals')
  @RequirePermission('deal.edit')
  async requestApproval(@Param('id') id: string, @Body() dto: ApprovalRequestDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const deal = await this.owned(id, actor, 'deal.edit');
    let kind: ApprovalKind;
    let payload: Record<string, unknown>;
    let summary: string;
    if (dto.operation === 'update') {
      // Only the price terms are ever requested; other fields the agent sets directly.
      const f = dto.fields ?? {};
      const agreed = f.agreedPriceMinor ?? (f.discountMinor != null ? deal.listPriceMinor - f.discountMinor : null);
      if (agreed === null || agreed === undefined) throw new BadRequestException('Say which price or discount you are asking for.');
      if (agreed < 0) throw new BadRequestException('The discount is larger than the price.');
      payload = { agreedPriceMinor: agreed };
      kind = agreed < deal.listPriceMinor ? 'DISCOUNT' : 'PRICE_CHANGE';
      summary = `${deal.unit.code}: list ${money(deal.listPriceMinor, deal.currency)} → requested ${money(agreed, deal.currency)}${agreed < deal.listPriceMinor ? ` (−${money(deal.listPriceMinor - agreed, deal.currency)})` : ''}`;
    } else {
      const a = dto.action;
      if (!a) throw new BadRequestException('Say which step you are asking for.');
      payload = JSON.parse(JSON.stringify(a)) as Record<string, unknown>;
      if (a.action === 'reserve') kind = 'RESERVATION';
      else if (a.action === 'sold') kind = 'DEAL_CLOSE';
      else if ((a.action === 'lost' || a.action === 'cancel') && deal.reservation?.status === 'ACTIVE') kind = 'CANCELLATION';
      else throw new BadRequestException('That step does not need approval — you can do it yourself.');
      summary = `${deal.unit.code}: ${APPROVAL_KIND_LABEL[kind].toLowerCase()} for ${deal.enquiry?.name ?? 'the buyer'}`;
    }
    if (can(actor, APPROVAL_PERMISSION[kind])) throw new BadRequestException('You can do this yourself — no approval is needed.');
    if (await this.prisma.client.approvalRequest.count({ where: { entity: 'deal', entityId: id, kind, status: 'PENDING' } })) throw new ConflictException('A request like this is already waiting for approval.');
    const created = await this.prisma.client.approvalRequest.create({
      data: { developmentId: deal.developmentId, kind, entity: 'deal', entityId: id, operation: dto.operation, payload: payload as Prisma.InputJsonObject, summary, note: dto.note ?? null, requestedById: actor.id },
      include: approvalInclude,
    });
    await this.audit.record({ actorId: actor.id, action: 'approval.request', entity: 'deal', entityId: id, target: `${deal.enquiry?.name ?? 'Deal'} · ${deal.unit.code}`, summary: `Requested ${APPROVAL_KIND_LABEL[kind].toLowerCase()} — ${summary}`, after: { approvalId: created.id, kind, ...payload }, req });
    const approvers = await this.access.activeUsersWith(APPROVAL_PERMISSION[kind]);
    await this.crm.notify(approvers, { kind: 'approval.request', title: `${APPROVAL_KIND_LABEL[kind]} requested`, body: `${actor.name} · ${summary}`, link: '/approvals', enquiryId: deal.enquiryId, dedupeKey: `approval:${created.id}` }, actor.id);
    return this.approvalView(actor, created);
  }

  @Post('approvals/:approvalId/decide')
  @HttpCode(200)
  async decide(@Param('approvalId') approvalId: string, @Body() dto: ApprovalDecisionDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const request = await this.prisma.client.approvalRequest.findFirst({ where: { id: approvalId, developmentId: await this.dev.id(), entity: 'deal' } });
    if (!request) throw new NotFoundException('No such approval request');
    const kind = request.kind as ApprovalKind;
    if (request.requestedById === actor.id) {
      // Rejecting your own request withdraws it; approving it never happens.
      if (dto.decision === 'reject') return this.withdraw(request.id, actor, req);
      throw new ForbiddenException('You cannot approve your own request.');
    }
    if (!can(actor, APPROVAL_PERMISSION[kind])) throw new ForbiddenException(`Your role does not allow this: ${APPROVAL_KIND_LABEL[kind].toLowerCase()}.`);
    // The deal must be within the approver's reach — the same check as doing it directly.
    const deal = await this.owned(request.entityId, actor, 'deal.edit');
    // Claim the request first, so two approvers clicking at once cannot both apply it.
    const claimed = await this.prisma.client.approvalRequest.updateMany({ where: { id: request.id, status: 'PENDING' }, data: { status: dto.decision === 'approve' ? 'APPROVED' : 'REJECTED', decidedById: actor.id, decidedAt: new Date(), decisionNote: dto.note ?? null, error: null } });
    if (!claimed.count) throw new ConflictException('Someone has already decided this request.');
    if (dto.decision === 'approve') {
      try {
        if (request.operation === 'update') await this.update(request.entityId, request.payload as DealFieldsDto, req);
        else await this.action(request.entityId, request.payload as unknown as DealActionDto, req);
      } catch (e) {
        // The change did not happen, so the request is still open — with the reason.
        await this.prisma.client.approvalRequest.update({ where: { id: request.id }, data: { status: 'PENDING', decidedById: null, decidedAt: null, decisionNote: null, error: (e as Error).message.slice(0, 500) } });
        throw e;
      }
    }
    const target = `${deal.enquiry?.name ?? 'Deal'} · ${deal.unit.code}`;
    const decided = dto.decision === 'approve' ? 'APPROVED' : 'REJECTED';
    await this.audit.record({ actorId: actor.id, action: dto.decision === 'approve' ? 'approval.approve' : 'approval.reject', entity: 'deal', entityId: request.entityId, target, summary: `${dto.decision === 'approve' ? 'Approved' : 'Rejected'} ${APPROVAL_KIND_LABEL[kind].toLowerCase()} — ${request.summary}${dto.note ? ` (${dto.note})` : ''}`, before: { approvalId: request.id, status: 'PENDING' }, after: { approvalId: request.id, status: decided, requestedById: request.requestedById }, req });
    await this.crm.notify([request.requestedById], { kind: `approval.${dto.decision}`, title: `${APPROVAL_KIND_LABEL[kind]} ${dto.decision === 'approve' ? 'approved' : 'rejected'}`, body: `${actor.name} · ${request.summary}${dto.note ? ` — ${dto.note}` : ''}`, link: deal.enquiryId ? `/crm/leads/${deal.enquiryId}` : '/crm/deals', enquiryId: deal.enquiryId }, actor.id);
    return this.approvalView(actor, await this.prisma.client.approvalRequest.findUniqueOrThrow({ where: { id: request.id }, include: approvalInclude }));
  }

  private async withdraw(id: string, actor: Actor, req: AdminRequest) {
    const done = await this.prisma.client.approvalRequest.updateMany({ where: { id, status: 'PENDING', requestedById: actor.id }, data: { status: 'CANCELLED', decidedById: actor.id, decidedAt: new Date() } });
    if (!done.count) throw new ConflictException('This request has already been decided.');
    const r = await this.prisma.client.approvalRequest.findUniqueOrThrow({ where: { id }, include: approvalInclude });
    await this.audit.record({ actorId: actor.id, action: 'approval.withdraw', entity: 'deal', entityId: r.entityId, summary: `Withdrew a request — ${r.summary}`, req });
    return this.approvalView(actor, r);
  }

  private approvalView(actor: Actor, a: Prisma.ApprovalRequestGetPayload<{ include: typeof approvalInclude }>) {
    const kind = a.kind as ApprovalKind;
    return {
      ...a,
      kindLabel: APPROVAL_KIND_LABEL[kind] ?? a.kind,
      mine: a.requestedById === actor.id,
      canDecide: a.status === 'PENDING' && a.requestedById !== actor.id && can(actor, APPROVAL_PERMISSION[kind]),
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private async owned(id: string, actor: Actor, p: RecordPermission) {
    const deal = await this.prisma.client.deal.findFirst({ where: { AND: [{ id, developmentId: await this.dev.id() }, this.scope(actor, p)] }, include });
    if (!deal) throw new NotFoundException('No such deal');
    return deal;
  }

  /** Agreeing a price or a discount is a manager's call; everything else is the agent's. */
  private assertPricing(actor: Actor, dto: DealFieldsDto, listPriceMinor: number, before?: { agreedPriceMinor: number | null; discountMinor: number | null }) {
    const priceTouched = (dto.agreedPriceMinor !== undefined && dto.agreedPriceMinor !== (before?.agreedPriceMinor ?? null) && dto.agreedPriceMinor !== listPriceMinor) || (dto.discountMinor !== undefined && dto.discountMinor !== (before?.discountMinor ?? null) && (dto.discountMinor ?? 0) > 0);
    if (priceTouched) assertCan(actor, 'deal.price');
    if (dto.discountMinor != null && dto.discountMinor > listPriceMinor) throw new BadRequestException('The discount is larger than the price.');
  }

  /** Agreed price and discount stay consistent: set one and the other follows from the list price. */
  private fields(dto: DealFieldsDto, listPriceMinor: number, before?: { agreedPriceMinor: number | null; discountMinor: number | null }): Partial<Prisma.DealUncheckedCreateInput> {
    let agreed = dto.agreedPriceMinor;
    let discount = dto.discountMinor;
    if (agreed !== undefined && discount === undefined) discount = agreed === null ? null : Math.max(0, listPriceMinor - agreed);
    else if (discount !== undefined && agreed === undefined) agreed = discount === null ? (before?.agreedPriceMinor ?? null) : listPriceMinor - discount;
    return {
      ...(agreed !== undefined ? { agreedPriceMinor: agreed } : {}),
      ...(discount !== undefined ? { discountMinor: discount } : {}),
      ...(dto.reservationAmountMinor !== undefined ? { reservationAmountMinor: dto.reservationAmountMinor } : {}),
      ...(dto.paymentPlanId !== undefined ? { paymentPlanId: dto.paymentPlanId } : {}),
      ...(dto.expectedCloseAt !== undefined ? { expectedCloseAt: dto.expectedCloseAt ? new Date(dto.expectedCloseAt) : null } : {}),
      ...(dto.contractSignedAt !== undefined ? { contractSignedAt: dto.contractSignedAt ? new Date(dto.contractSignedAt) : null } : {}),
      ...(dto.agentId !== undefined ? { agentId: dto.agentId } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
    };
  }

  private async assertRefs(developmentId: string, dto: DealFieldsDto) {
    if (dto.paymentPlanId && !(await this.prisma.client.paymentPlan.count({ where: { id: dto.paymentPlanId, developmentId } }))) throw new BadRequestException('That payment plan does not exist.');
    if (dto.agentId) {
      const u = await this.prisma.client.adminUser.findUnique({ where: { id: dto.agentId }, select: { active: true } });
      if (!u?.active) throw new BadRequestException('That agent does not exist or is inactive.');
    }
  }
}
