import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
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
import type { Prisma, ReservationStatus } from '@avida/db';
import { can, formatMoney } from '@avida/types';
import { CrmService } from '../../common/crm.service.js';
import { AuditService } from '../../common/audit.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { PrismaService } from '../../common/prisma.service.js';
import { PublicSync } from '../../common/public-sync.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf, assertCan } from './actor.js';
import { CloseReservationDto, CreateReservationDto, UpdateReservationDto } from './dto.js';
import { reservationInclude as include, ReservationService } from './reservation.service.js';

/**
 * Audit §12 / §40.3 — a reservation is a record: which residence, for whom,
 * held until when, with what deposit, by which agent. Placing a hold puts the
 * residence BOOKED (the website reads it as booked at once); converting it
 * sells the residence; cancelling or letting it lapse returns it to its previous
 * status. The worker expires lapsed holds hourly and warns the agent first.
 */
@Controller('admin/reservations')
@UseGuards(AdminGuard)
@RequirePermission('residence.view')
@UseInterceptors(NoStoreInterceptor)
export class ReservationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly audit: AuditService,
    private readonly sync: PublicSync,
    private readonly crm: CrmService,
    private readonly reservations: ReservationService,
  ) {}

  @Get()
  async list(@Req() req: AdminRequest, @Query('status') status?: string) {
    const developmentId = await this.dev.id();
    const where: Prisma.ReservationWhereInput = { developmentId, ...(status ? { status: { in: status.split(',') as ReservationStatus[] } } : {}) };
    const [rows, counts] = await Promise.all([
      this.prisma.client.reservation.findMany({ where, orderBy: [{ status: 'asc' }, { heldUntil: 'asc' }], include, take: 500 }),
      this.prisma.client.reservation.groupBy({ by: ['status'], where: { developmentId }, _count: true }),
    ]);
    const canBuyers = can(actorOf(req), 'buyer.view');
    // Field-level: deposit amounts need `finance.view` (or the authority to manage reservations).
    const canMoney = can(actorOf(req), 'finance.view') || can(actorOf(req), 'reservation.edit');
    const now = Date.now();
    return {
      data: rows.map((r) => ({
        ...r,
        depositMinor: canMoney ? r.depositMinor : null,
        buyer: canBuyers ? r.buyer : r.buyer ? { id: r.buyer.id, fullName: 'Client' } : null,
        hoursLeft: r.status === 'ACTIVE' ? Math.round((r.heldUntil.getTime() - now) / 3_600_000) : null,
      })),
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
      depositsHeldMinor: !canMoney ? null : rows.filter((r) => r.status === 'ACTIVE' && r.depositReceivedAt).reduce((a, r) => a + (r.depositMinor ?? 0), 0),
    };
  }

  @Post()
  @RequirePermission('reservation.edit')
  async create(@Body() dto: CreateReservationDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const developmentId = await this.dev.id();
    if (dto.buyerId && !(await this.prisma.client.buyer.count({ where: { id: dto.buyerId, developmentId } }))) throw new BadRequestException('That client does not belong to this property.');
    if (dto.enquiryId) {
      const lead = await this.prisma.client.enquiry.findFirst({ where: { AND: [{ id: dto.enquiryId, developmentId }, this.crm.leadScope(actor)] }, select: { id: true } });
      if (!lead) throw new BadRequestException('That lead does not belong to this property.');
    }
    const reservation = await this.prisma.client.$transaction((tx) => this.reservations.hold(tx, { developmentId, ...dto }, actor.id));
    await this.audit.record({ actorId: actor.id, action: 'reservation.create', entity: 'residence', entityId: reservation.unitId, target: reservation.unit.code, summary: `Reserved ${reservation.unit.code} until ${reservation.heldUntil.toISOString().slice(0, 10)}${dto.depositMinor ? `, deposit ${formatMoney({ amountMinor: dto.depositMinor, currency: reservation.currency })}` : ''}`, after: { status: 'BOOKED', heldUntil: reservation.heldUntil }, req });
    if (reservation.enquiryId) await this.crm.rescore(reservation.enquiryId);
    await this.crm.notify(await this.crm.managerIds(), { kind: 'reservation.created', title: `${reservation.unit.code} reserved`, body: `${actor.name} placed a hold until ${reservation.heldUntil.toISOString().slice(0, 10)}.`, link: reservation.enquiryId ? `/crm/leads/${reservation.enquiryId}` : '/reservations', enquiryId: reservation.enquiryId }, actor.id);
    await this.sync.changed('inventory');
    return reservation;
  }

  @Patch(':id')
  @RequirePermission('reservation.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateReservationDto, @Req() req: AdminRequest) {
    const before = await this.owned(id);
    if (before.status !== 'ACTIVE') throw new ConflictException('Only an active reservation can be changed.');
    if (dto.heldUntil && new Date(dto.heldUntil).getTime() <= Date.now()) throw new BadRequestException('A hold must end in the future.');
    const row = await this.prisma.client.reservation.update({
      where: { id },
      data: {
        ...(dto.heldUntil ? { heldUntil: new Date(dto.heldUntil), expiryNoticeSentAt: null } : {}),
        ...(dto.agentId !== undefined ? { agentId: dto.agentId } : {}),
        ...(dto.buyerId !== undefined ? { buyerId: dto.buyerId } : {}),
        ...(dto.depositMinor !== undefined ? { depositMinor: dto.depositMinor } : {}),
        ...(dto.depositReceivedAt !== undefined ? { depositReceivedAt: dto.depositReceivedAt ? new Date(dto.depositReceivedAt) : null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      include,
    });
    const parts = [dto.heldUntil ? `extended to ${dto.heldUntil.slice(0, 10)}` : null, dto.depositReceivedAt ? 'deposit received' : null, dto.depositMinor !== undefined ? 'deposit amount' : null, dto.agentId !== undefined ? 'agent' : null].filter(Boolean);
    await this.audit.record({ actorId: actorOf(req).id, action: 'reservation.update', entity: 'residence', entityId: before.unitId, target: before.unit.code, summary: `Reservation of ${before.unit.code}: ${parts.join(', ') || 'details'}`, before: { heldUntil: before.heldUntil, depositMinor: before.depositMinor, depositReceivedAt: before.depositReceivedAt, agentId: before.agentId }, after: { heldUntil: row.heldUntil, depositMinor: row.depositMinor, depositReceivedAt: row.depositReceivedAt, agentId: row.agentId }, req });
    if (before.enquiryId && parts.length) await this.crm.logActivity(this.prisma.client, before.enquiryId, 'RESERVATION', `Reservation of ${before.unit.code}: ${parts.join(', ')}`, actorOf(req).id, { meta: { reservationId: id } });
    return row;
  }

  /** Convert to a sale, or cancel and return the residence to sale. */
  @Post(':id/close')
  @HttpCode(200)
  @RequirePermission('reservation.edit')
  async close(@Param('id') id: string, @Body() dto: CloseReservationDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    // Cancelling a hold is routine; declaring a sale is not.
    if (dto.action === 'convert') assertCan(actor, 'deal.close');
    const r = await this.owned(id);
    const { unitStatus } = await this.prisma.client.$transaction((tx) => this.reservations.close(tx, r.id, dto.action, actor.id, dto.reason));
    await this.audit.record({ actorId: actor.id, action: `reservation.${dto.action}`, entity: 'residence', entityId: r.unitId, target: r.unit.code, summary: dto.action === 'convert' ? `Converted the reservation of ${r.unit.code} into a sale` : `Cancelled the reservation of ${r.unit.code}; it is ${unitStatus.toLowerCase()} again`, before: { status: 'ACTIVE' }, after: { status: dto.action === 'convert' ? 'CONVERTED' : 'CANCELLED', unitStatus }, req });
    if (r.enquiryId) await this.crm.rescore(r.enquiryId);
    await this.sync.changed('inventory');
    return { ok: true };
  }

  private async owned(id: string) {
    const r = await this.prisma.client.reservation.findFirst({ where: { id, developmentId: await this.dev.id() }, include });
    if (!r) throw new NotFoundException('No such reservation');
    return r;
  }
}
