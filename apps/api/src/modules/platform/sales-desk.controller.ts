import { Controller, Get, HttpCode, Post, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import type { EnquiryStatus } from '@avida/db';
import { FIRST_RESPONSE_HOURS, RESERVATION_WARNING_HOURS } from '@avida/types';
import { AuditService } from '../../common/audit.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { NotificationService } from '../../common/notification.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf } from './actor.js';

/**
 * Roadmap items 41-42 — what the sales team must do next, in one read: leads no
 * one has answered, follow-ups that are due, viewings waiting for a time or
 * happening soon, holds about to lapse, and emails that could not be delivered.
 */
@Controller('admin/sales-desk')
@UseGuards(AdminGuard)
@RequirePermission('enquiry.view')
@UseInterceptors(NoStoreInterceptor)
export class SalesDeskController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async desk(@Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const me = actorOf(req).id;
    const now = new Date();
    const open = { notIn: ['LOST', 'SPAM', 'SOLD'] as EnquiryStatus[] };
    const [uncontacted, overdue, requests, upcoming, expiring, mine, health] = await Promise.all([
      this.prisma.client.enquiry.findMany({
        where: { developmentId, status: 'NEW', contactedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 12,
        select: { id: true, name: true, intent: true, createdAt: true, assignedTo: { select: { name: true } }, units: { select: { unit: { select: { code: true } } } } },
      }),
      this.prisma.client.enquiry.findMany({
        where: { developmentId, status: open, followUpAt: { lt: now } },
        orderBy: { followUpAt: 'asc' },
        take: 12,
        select: { id: true, name: true, status: true, followUpAt: true, assignedTo: { select: { name: true } } },
      }),
      this.prisma.client.viewing.findMany({ where: { developmentId, status: 'REQUESTED' }, orderBy: [{ requestedDate: 'asc' }, { createdAt: 'asc' }], take: 12, select: { id: true, name: true, requestedDate: true, requestedSlot: true, createdAt: true, units: { select: { unit: { select: { code: true } } } } } }),
      this.prisma.client.viewing.findMany({
        where: { developmentId, status: 'CONFIRMED', scheduledAt: { gte: new Date(now.getTime() - 2 * 3_600_000), lte: new Date(now.getTime() + 7 * 86_400_000) } },
        orderBy: { scheduledAt: 'asc' },
        take: 12,
        select: { id: true, name: true, scheduledAt: true, agent: { select: { name: true } }, units: { select: { unit: { select: { code: true } } } } },
      }),
      this.prisma.client.reservation.findMany({
        where: { developmentId, status: 'ACTIVE', heldUntil: { lte: new Date(now.getTime() + Math.max(72, RESERVATION_WARNING_HOURS) * 3_600_000) } },
        orderBy: { heldUntil: 'asc' },
        select: { id: true, heldUntil: true, depositReceivedAt: true, unit: { select: { code: true } }, buyer: { select: { fullName: true } } },
      }),
      this.prisma.client.enquiry.count({ where: { developmentId, assignedToId: me, status: open } }),
      this.notifications.health(developmentId),
    ]);
    const codes = (u: { unit: { code: string } }[]) => u.map((x) => x.unit.code);
    return {
      firstResponseHours: FIRST_RESPONSE_HOURS,
      uncontacted: uncontacted.map((l) => ({ ...l, assignedTo: l.assignedTo?.name ?? null, units: codes(l.units), overdue: now.getTime() - l.createdAt.getTime() > FIRST_RESPONSE_HOURS * 3_600_000 })),
      overdue: overdue.map((l) => ({ ...l, assignedTo: l.assignedTo?.name ?? null })),
      viewingRequests: requests.map((v) => ({ ...v, units: codes(v.units) })),
      upcomingViewings: upcoming.map((v) => ({ ...v, agent: v.agent?.name ?? null, units: codes(v.units) })),
      expiringReservations: expiring.map((r) => ({ id: r.id, code: r.unit.code, heldUntil: r.heldUntil, buyer: r.buyer?.fullName ?? null, depositReceived: Boolean(r.depositReceivedAt) })),
      mine,
      notifications: health,
    };
  }

  @Post('notifications/retry')
  @HttpCode(200)
  @RequirePermission('enquiry.edit')
  async retry(@Req() req: AdminRequest) {
    const count = await this.notifications.retry(await this.dev.id());
    await this.audit.record({ actorId: actorOf(req).id, action: 'notification.retry', entity: 'notification', summary: `Retried ${count} undelivered emails`, rowCount: count, req });
    return { retried: count };
  }
}
