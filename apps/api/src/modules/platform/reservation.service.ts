import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, UnitStatus } from '@avida/db';
import { DEFAULT_HOLD_DAYS } from '@avida/types';
import { CrmService } from '../../common/crm.service.js';
import { rethrowPrisma } from '../../common/http.js';
import { PrismaService } from '../../common/prisma.service.js';

type Tx = Prisma.TransactionClient;

export const reservationInclude = {
  unit: { select: { id: true, code: true, status: true, priceMinor: true, currency: true, floor: { select: { label: true, displayName: true } } } },
  buyer: { select: { id: true, fullName: true } },
  enquiry: { select: { id: true, name: true } },
  agent: { select: { id: true, name: true } },
  deal: { select: { id: true, status: true } },
} satisfies Prisma.ReservationInclude;

export interface HoldInput {
  developmentId: string;
  unitId: string;
  buyerId?: string | null;
  enquiryId?: string | null;
  agentId?: string | null;
  heldUntil?: string | Date | null;
  depositMinor?: number | null;
  notes?: string | null;
}

/**
 * Audit §12 / §40.3 — the only code that changes a residence's status for a
 * sale. A hold flips the residence AVAILABLE → BOOKED with a compare-and-set
 * inside the transaction, so two agents reserving the same home at the same
 * moment get one reservation and one clear refusal, never two holds.
 */
@Injectable()
export class ReservationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crm: CrmService,
  ) {}

  async hold(tx: Tx, input: HoldInput, actorId: string) {
    const unit = await tx.unit.findFirst({ where: { id: input.unitId, developmentId: input.developmentId, archivedAt: null } });
    if (!unit) throw new NotFoundException('No such residence');
    if (unit.status !== 'AVAILABLE') throw new ConflictException(`${unit.code} is ${unit.status.toLowerCase().replace('_', ' ')}, so it cannot be reserved.`);
    const heldUntil = input.heldUntil ? new Date(input.heldUntil) : new Date(Date.now() + DEFAULT_HOLD_DAYS * 86_400_000);
    if (heldUntil.getTime() <= Date.now()) throw new BadRequestException('A hold must end in the future.');

    // The compare-and-set: whoever flips the row first wins; the other sees 0 rows.
    const { count } = await tx.unit.updateMany({ where: { id: unit.id, status: 'AVAILABLE' }, data: { status: 'BOOKED' } });
    if (!count) throw new ConflictException(`${unit.code} was reserved by someone else a moment ago.`);
    if (await tx.reservation.count({ where: { unitId: unit.id, status: 'ACTIVE' } })) throw new ConflictException(`${unit.code} already has an active reservation.`);

    const reservation = await tx.reservation.create({
      data: {
        developmentId: input.developmentId,
        unitId: unit.id,
        buyerId: input.buyerId ?? null,
        enquiryId: input.enquiryId ?? null,
        agentId: input.agentId ?? actorId,
        heldUntil,
        depositMinor: input.depositMinor ?? null,
        currency: unit.currency,
        notes: input.notes ?? null,
        previousStatus: unit.status,
      },
      include: reservationInclude,
    }).catch((e: unknown) => rethrowPrisma(e, { unique: `${unit.code} already has an active reservation.` }));
    await tx.unitStatusLog.create({ data: { unitId: unit.id, from: unit.status, to: 'BOOKED', actor: actorId, note: `Reserved until ${heldUntil.toISOString().slice(0, 10)}` } });
    if (input.enquiryId) {
      const lead = await tx.enquiry.findUniqueOrThrow({ where: { id: input.enquiryId } });
      await this.crm.moveLead(tx, lead, { status: 'RESERVED' }, actorId, { forwardOnly: true, reason: `reserved ${unit.code}` });
      await this.crm.logActivity(tx, input.enquiryId, 'RESERVATION', `Reserved residence ${unit.code} until ${heldUntil.toISOString().slice(0, 10)}`, actorId, { meta: { unitId: unit.id, reservationId: reservation.id } });
    }
    return reservation;
  }

  /**
   * Converts a hold into a sale, or cancels it and returns the residence to
   * its previous status. The lead and any deal follow.
   */
  async close(tx: Tx, reservationId: string, action: 'convert' | 'cancel', actorId: string, reason?: string | null) {
    const r = await tx.reservation.findUniqueOrThrow({ where: { id: reservationId }, include: reservationInclude });
    if (r.status !== 'ACTIVE') throw new ConflictException('This reservation is already closed.');
    const claimed = await tx.reservation.updateMany({ where: { id: r.id, status: 'ACTIVE' }, data: { status: action === 'convert' ? 'CONVERTED' : 'CANCELLED', closedAt: new Date(), closedReason: reason ?? null } });
    if (!claimed.count) throw new ConflictException('This reservation was closed by someone else a moment ago.');

    const next: UnitStatus = action === 'convert' ? 'SOLD' : r.previousStatus;
    const unit = await tx.unit.findUniqueOrThrow({ where: { id: r.unitId } });
    if (unit.status !== next) {
      await tx.unit.update({ where: { id: r.unitId }, data: { status: next, ...(action === 'convert' && r.buyerId ? { buyerId: r.buyerId } : {}) } });
      await tx.unitStatusLog.create({ data: { unitId: r.unitId, from: unit.status, to: next, actor: actorId, note: action === 'convert' ? 'Reservation converted to a sale' : `Reservation cancelled${reason ? `: ${reason}` : ''}` } });
    }
    if (r.deal && ['RESERVED', 'CONTRACT'].includes(r.deal.status)) {
      await tx.deal.update({
        where: { id: r.deal.id },
        data: action === 'convert' ? { status: 'SOLD', closedAt: new Date() } : { status: 'NEGOTIATION', reservationId: null },
      });
    }
    if (r.enquiryId) {
      const lead = await tx.enquiry.findUniqueOrThrow({ where: { id: r.enquiryId } });
      if (action === 'convert') await this.crm.moveLead(tx, lead, { status: 'SOLD' }, actorId, { reason: `sold ${r.unit.code}` });
      else if (lead.status === 'RESERVED' || lead.status === 'CONTRACT') await this.crm.moveLead(tx, lead, { status: 'NEGOTIATION' }, actorId, { reason: 'reservation cancelled' });
      await this.crm.logActivity(tx, r.enquiryId, 'RESERVATION', action === 'convert' ? `Reservation of ${r.unit.code} converted to a sale` : `Reservation of ${r.unit.code} cancelled${reason ? `: ${reason}` : ''}`, actorId, { meta: { unitId: r.unitId, reservationId: r.id } });
    }
    return { reservation: r, unitStatus: next };
  }
}
