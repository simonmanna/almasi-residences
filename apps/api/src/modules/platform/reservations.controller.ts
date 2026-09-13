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
import type { Prisma, ReservationStatus, UnitStatus } from '@avida/db';
import { can, DEFAULT_HOLD_DAYS, formatMoney } from '@avida/types';
import { AuditService } from '../../common/audit.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { PrismaService } from '../../common/prisma.service.js';
import { PublicSync } from '../../common/public-sync.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf, assertCan } from './actor.js';
import { CloseReservationDto, CreateReservationDto, UpdateReservationDto } from './dto.js';

const include = {
  unit: { select: { id: true, code: true, status: true, priceMinor: true, currency: true, floor: { select: { label: true, displayName: true } } } },
  buyer: { select: { id: true, fullName: true } },
  enquiry: { select: { id: true, name: true } },
  agent: { select: { id: true, name: true } },
} satisfies Prisma.ReservationInclude;

/**
 * Audit §12 / §40.3 — a reservation is a record: which residence, for whom,
 * held until when, with what deposit, by which agent. Placing a hold puts the
 * residence ON_HOLD (the website reads it as reserved at once); converting it
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
  ) {}

  @Get()
  async list(@Req() req: AdminRequest, @Query('status') status?: string) {
    const developmentId = await this.dev.id();
    const where: Prisma.ReservationWhereInput = { developmentId, ...(status ? { status: { in: status.split(',') as ReservationStatus[] } } : {}) };
    const [rows, counts] = await Promise.all([
      this.prisma.client.reservation.findMany({ where, orderBy: [{ status: 'asc' }, { heldUntil: 'asc' }], include, take: 500 }),
      this.prisma.client.reservation.groupBy({ by: ['status'], where: { developmentId }, _count: true }),
    ]);
    const canBuyers = can(actorOf(req).role, 'buyer.view');
    const now = Date.now();
    return {
      data: rows.map((r) => ({
        ...r,
        buyer: canBuyers ? r.buyer : r.buyer ? { id: r.buyer.id, fullName: 'Client' } : null,
        hoursLeft: r.status === 'ACTIVE' ? Math.round((r.heldUntil.getTime() - now) / 3_600_000) : null,
      })),
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
      depositsHeldMinor: rows.filter((r) => r.status === 'ACTIVE' && r.depositReceivedAt).reduce((a, r) => a + (r.depositMinor ?? 0), 0),
    };
  }

  @Post()
  @RequirePermission('reservation.edit')
  async create(@Body() dto: CreateReservationDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    assertCan(actor, 'residence.status');
    const developmentId = await this.dev.id();
    const unit = await this.prisma.client.unit.findFirst({ where: { id: dto.unitId, developmentId, archivedAt: null } });
    if (!unit) throw new NotFoundException('No such residence');
    if (unit.status !== 'AVAILABLE') throw new ConflictException(`${unit.code} is ${unit.status.toLowerCase().replace('_', ' ')}, so it cannot be held.`);
    const active = await this.prisma.client.reservation.count({ where: { unitId: unit.id, status: 'ACTIVE' } });
    if (active) throw new ConflictException(`${unit.code} already has an active reservation.`);
    if (dto.buyerId && !(await this.prisma.client.buyer.count({ where: { id: dto.buyerId, developmentId } }))) throw new BadRequestException('That client does not belong to this property.');
    if (dto.enquiryId && !(await this.prisma.client.enquiry.count({ where: { id: dto.enquiryId, developmentId } }))) throw new BadRequestException('That enquiry does not belong to this property.');
    const heldUntil = dto.heldUntil ? new Date(dto.heldUntil) : new Date(Date.now() + DEFAULT_HOLD_DAYS * 86_400_000);
    if (heldUntil.getTime() <= Date.now()) throw new BadRequestException('A hold must end in the future.');

    const reservation = await this.prisma.client.$transaction(async (tx) => {
      const r = await tx.reservation.create({
        data: { developmentId, unitId: unit.id, buyerId: dto.buyerId ?? null, enquiryId: dto.enquiryId ?? null, agentId: dto.agentId ?? actor.id, heldUntil, depositMinor: dto.depositMinor ?? null, currency: unit.currency, notes: dto.notes ?? null, previousStatus: unit.status },
        include,
      });
      await tx.unit.update({ where: { id: unit.id }, data: { status: 'ON_HOLD' } });
      await tx.unitStatusLog.create({ data: { unitId: unit.id, from: unit.status, to: 'ON_HOLD', actor: actor.id, note: `Reserved until ${heldUntil.toISOString().slice(0, 10)}` } });
      if (dto.enquiryId) {
        await tx.enquiry.update({ where: { id: dto.enquiryId }, data: { status: 'RESERVED', lastActivityAt: new Date() } });
        await tx.leadNote.create({ data: { enquiryId: dto.enquiryId, authorId: actor.id, kind: 'STATUS', body: `Reserved residence ${unit.code} until ${heldUntil.toISOString().slice(0, 10)}` } });
      }
      return r;
    });
    await this.audit.record({ actorId: actor.id, action: 'reservation.create', entity: 'residence', entityId: unit.id, target: unit.code, summary: `Reserved ${unit.code} until ${heldUntil.toISOString().slice(0, 10)}${dto.depositMinor ? `, deposit ${formatMoney({ amountMinor: dto.depositMinor, currency: unit.currency })}` : ''}`, req });
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
    await this.audit.record({ actorId: actorOf(req).id, action: 'reservation.update', entity: 'residence', entityId: before.unitId, target: before.unit.code, summary: `Reservation of ${before.unit.code}: ${parts.join(', ') || 'details'}`, req });
    return row;
  }

  /** Convert to a sale, or cancel and return the residence to sale. */
  @Post(':id/close')
  @HttpCode(200)
  @RequirePermission('reservation.edit')
  async close(@Param('id') id: string, @Body() dto: CloseReservationDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    assertCan(actor, 'residence.status');
    const r = await this.owned(id);
    if (r.status !== 'ACTIVE') throw new ConflictException('This reservation is already closed.');
    const next: UnitStatus = dto.action === 'convert' ? 'SOLD' : r.previousStatus;
    await this.prisma.client.$transaction(async (tx) => {
      await tx.reservation.update({ where: { id }, data: { status: dto.action === 'convert' ? 'CONVERTED' : 'CANCELLED', closedAt: new Date(), closedReason: dto.reason ?? null } });
      const unit = await tx.unit.findUniqueOrThrow({ where: { id: r.unitId } });
      if (unit.status !== next) {
        await tx.unit.update({ where: { id: r.unitId }, data: { status: next, ...(dto.action === 'convert' && r.buyerId ? { buyerId: r.buyerId } : {}) } });
        await tx.unitStatusLog.create({ data: { unitId: r.unitId, from: unit.status, to: next, actor: actor.id, note: dto.action === 'convert' ? 'Reservation converted to a sale' : `Reservation cancelled${dto.reason ? `: ${dto.reason}` : ''}` } });
      }
      if (r.enquiryId) {
        await tx.enquiry.update({ where: { id: r.enquiryId }, data: { status: dto.action === 'convert' ? 'SOLD' : 'INTERESTED', lastActivityAt: new Date() } });
        await tx.leadNote.create({ data: { enquiryId: r.enquiryId, authorId: actor.id, kind: 'STATUS', body: dto.action === 'convert' ? `Reservation of ${r.unit.code} converted to a sale` : `Reservation of ${r.unit.code} cancelled${dto.reason ? `: ${dto.reason}` : ''}` } });
      }
    });
    await this.audit.record({ actorId: actor.id, action: `reservation.${dto.action}`, entity: 'residence', entityId: r.unitId, target: r.unit.code, summary: dto.action === 'convert' ? `Converted the reservation of ${r.unit.code} into a sale` : `Cancelled the reservation of ${r.unit.code}; it is ${next.toLowerCase()} again`, req });
    await this.sync.changed('inventory');
    return { ok: true };
  }

  private async owned(id: string) {
    const r = await this.prisma.client.reservation.findFirst({ where: { id, developmentId: await this.dev.id() }, include });
    if (!r) throw new NotFoundException('No such reservation');
    return r;
  }
}
