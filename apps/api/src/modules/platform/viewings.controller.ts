import {
  BadRequestException,
  Body,
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
import type { Prisma, TaskType, ViewingInterest, ViewingStatus } from '@avida/db';
import { can, emailViewingConfirmation, isBookedViewing, VIEWING_INTEREST_LABEL, VIEWING_STATUS_LABEL, type ViewingStatusValue } from '@avida/types';
import { AuditService } from '../../common/audit.service.js';
import { CrmService } from '../../common/crm.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { NotificationService } from '../../common/notification.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf, type Actor } from './actor.js';
import { ViewingFeedbackDto } from './crm.dto.js';
import { CreateViewingDto, UpdateViewingDto } from './dto.js';

const include = {
  agent: { select: { id: true, name: true } },
  enquiry: { select: { id: true, name: true, status: true, assignedToId: true } },
  units: { include: { unit: { select: { id: true, code: true, status: true } } } },
  alternativeUnit: { select: { id: true, code: true } },
} satisfies Prisma.ViewingInclude;

const BOOKED: ViewingStatus[] = ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'];

/**
 * §15.2 — viewings as a real workflow: a visitor requests a day and a part of
 * the day; the sales team schedules a time and an agent (the visitor gets a
 * confirmation, and a reminder the day before from the worker); the visitor
 * confirms; a new time is a reschedule; afterwards the agent records how it
 * went, which moves the lead along the pipeline and sets the next action.
 */
@Controller('admin/viewings')
@UseGuards(AdminGuard)
@RequirePermission('enquiry.view')
@UseInterceptors(NoStoreInterceptor)
export class ViewingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly crm: CrmService,
  ) {}

  /** Agents see viewings they run and viewings on leads they can see. */
  private scope(actor: Actor): Prisma.ViewingWhereInput {
    return can(actor.role, 'enquiry.view-all') ? {} : { OR: [{ agentId: actor.id }, { enquiry: this.crm.leadScope(actor) }, { enquiryId: null, agentId: null }] };
  }

  /** The calendar: booked viewings in a date range, plus every request still waiting for a time. */
  @Get()
  async list(@Req() req: AdminRequest, @Query('from') from?: string, @Query('to') to?: string, @Query('agentId') agentId?: string, @Query('status') status?: string) {
    const actor = actorOf(req);
    const developmentId = await this.dev.id();
    const start = from && !Number.isNaN(Date.parse(from)) ? new Date(from) : new Date(Date.now() - 7 * 86_400_000);
    const end = to && !Number.isNaN(Date.parse(to)) ? new Date(to) : new Date(start.getTime() + 42 * 86_400_000);
    const scope = this.scope(actor);
    const [scheduled, requests, counts, feedbackDue] = await Promise.all([
      this.prisma.client.viewing.findMany({
        where: { AND: [scope, { developmentId, scheduledAt: { gte: start, lt: end }, ...(agentId ? { agentId: agentId === 'me' ? actor.id : agentId } : {}), ...(status ? { status: status as ViewingStatus } : {}) }] },
        orderBy: { scheduledAt: 'asc' },
        include,
      }),
      this.prisma.client.viewing.findMany({ where: { AND: [scope, { developmentId, status: 'REQUESTED', scheduledAt: null }] }, orderBy: [{ requestedDate: 'asc' }, { createdAt: 'asc' }], include }),
      this.prisma.client.viewing.groupBy({ by: ['status'], where: { AND: [scope, { developmentId, createdAt: { gte: new Date(Date.now() - 90 * 86_400_000) } }] }, _count: true }),
      // Booked viewings whose time has passed with no outcome recorded.
      this.prisma.client.viewing.findMany({ where: { AND: [scope, { developmentId, status: { in: BOOKED }, scheduledAt: { lt: new Date(Date.now() - 60 * 60_000) } }] }, orderBy: { scheduledAt: 'desc' }, take: 20, include }),
    ]);
    const shape = (v: (typeof scheduled)[number]) => ({ ...v, units: v.units.map((u) => u.unit) });
    return { scheduled: scheduled.map(shape), requests: requests.map(shape), feedbackDue: feedbackDue.map(shape), counts: Object.fromEntries(counts.map((c) => [c.status, c._count])), range: { from: start, to: end } };
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() req: AdminRequest) {
    const v = await this.owned(id, actorOf(req));
    const notifications = await this.prisma.client.notification.findMany({ where: { viewingId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, kind: true, status: true, recipient: true, sentAt: true, lastError: true } });
    return { ...v, units: v.units.map((u) => u.unit), notifications };
  }

  @Post()
  @RequirePermission('enquiry.edit')
  async create(@Body() dto: CreateViewingDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const developmentId = await this.dev.id();
    let person: { name?: string; email?: string | null; phone?: string | null } = { name: dto.name, email: dto.email, phone: dto.phone };
    if (dto.enquiryId) {
      const lead = await this.prisma.client.enquiry.findFirst({ where: { AND: [{ id: dto.enquiryId, developmentId }, this.crm.leadScope(actor)] }, include: { units: true } });
      if (!lead) throw new BadRequestException('That lead does not belong to this property.');
      person = { name: lead.name, email: lead.email, phone: lead.phone ?? lead.whatsapp };
      if (!dto.unitIds?.length) dto.unitIds = [...new Set([...(lead.primaryUnitId ? [lead.primaryUnitId] : []), ...lead.units.map((u) => u.unitId)])];
    }
    if (!person.name || (!person.email && !person.phone)) throw new BadRequestException('A viewing needs the visitor’s name and a phone or email.');
    if (dto.scheduledAt && new Date(dto.scheduledAt).getTime() < Date.now() - 60 * 60_000) throw new BadRequestException('That time is in the past.');
    await this.assertUnits(dto.unitIds, developmentId);
    await this.assertAgent(dto.agentId);
    const viewing = await this.prisma.client.viewing.create({
      data: {
        developmentId,
        enquiryId: dto.enquiryId ?? null,
        buyerId: dto.buyerId ?? null,
        name: person.name,
        email: person.email?.toLowerCase() ?? null,
        phone: person.phone ?? null,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        durationMinutes: dto.durationMinutes ?? 45,
        agentId: dto.agentId ?? actor.id,
        status: dto.scheduledAt ? ((dto.status as ViewingStatus) === 'CONFIRMED' ? 'CONFIRMED' : 'SCHEDULED') : 'REQUESTED',
        location: dto.location ?? null,
        notes: dto.notes ?? null,
        units: dto.unitIds?.length ? { create: dto.unitIds.map((unitId) => ({ unitId })) } : undefined,
      },
      include,
    });
    await this.audit.record({ actorId: actor.id, action: 'viewing.create', entity: 'viewing', entityId: viewing.id, target: viewing.name, summary: `Booked a viewing for ${viewing.name}${viewing.scheduledAt ? ` on ${viewing.scheduledAt.toISOString().slice(0, 10)}` : ''}`, after: { status: viewing.status, scheduledAt: viewing.scheduledAt, agentId: viewing.agentId }, req });
    if (viewing.enquiryId) {
      await this.crm.logActivity(this.prisma.client, viewing.enquiryId, 'VIEWING', viewing.scheduledAt ? `Viewing scheduled for ${this.when(viewing.scheduledAt)}${viewing.units.length ? ` · ${viewing.units.map((u) => u.unit.code).join(', ')}` : ''}` : 'Viewing requested — time to be arranged', actor.id, { meta: { viewingId: viewing.id } });
    }
    await this.afterChange(viewing.id, null, dto.notify !== false && Boolean(viewing.scheduledAt), actor);
    return this.get(viewing.id, req);
  }

  @Patch(':id')
  @RequirePermission('enquiry.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateViewingDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const before = await this.owned(id, actor);
    const developmentId = before.developmentId;
    await this.assertUnits(dto.unitIds, developmentId);
    await this.assertAgent(dto.agentId);
    const scheduledAt = dto.scheduledAt === undefined ? undefined : dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    let status = dto.status as ViewingStatus | undefined;
    const rescheduled = scheduledAt !== undefined && scheduledAt !== null && before.scheduledAt !== null && scheduledAt.getTime() !== before.scheduledAt.getTime();
    if (!status && scheduledAt && before.status === 'REQUESTED') status = 'SCHEDULED';
    if (!status && rescheduled && BOOKED.includes(before.status)) status = 'RESCHEDULED';
    if (status && BOOKED.includes(status) && !(scheduledAt ?? before.scheduledAt)) throw new BadRequestException('Choose the date and time first.');
    if ((status === 'COMPLETED' || status === 'NO_SHOW') && !before.scheduledAt && !scheduledAt) throw new BadRequestException('A viewing that was never scheduled cannot be completed.');

    await this.prisma.client.$transaction(async (tx) => {
      await tx.viewing.update({
        where: { id },
        data: {
          ...(scheduledAt !== undefined ? { scheduledAt } : {}),
          ...(dto.durationMinutes !== undefined ? { durationMinutes: dto.durationMinutes } : {}),
          ...(dto.agentId !== undefined ? { agentId: dto.agentId } : {}),
          ...(status ? { status } : {}),
          ...(dto.location !== undefined ? { location: dto.location } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...(dto.outcome !== undefined ? { outcome: dto.outcome } : {}),
          // A new time needs a new reminder.
          ...(rescheduled ? { reminderSentAt: null, rescheduleCount: { increment: 1 } } : {}),
        },
      });
      if (dto.unitIds) {
        await tx.viewingUnit.deleteMany({ where: { viewingId: id } });
        if (dto.unitIds.length) await tx.viewingUnit.createMany({ data: dto.unitIds.map((unitId) => ({ viewingId: id, unitId })) });
      }
      if (before.enquiryId && (status !== undefined && status !== before.status || rescheduled)) {
        const line = rescheduled
          ? `Viewing rescheduled: ${this.when(before.scheduledAt!)} → ${this.when(scheduledAt!)}`
          : `Viewing ${VIEWING_STATUS_LABEL[status as ViewingStatusValue].toLowerCase()}${(scheduledAt ?? before.scheduledAt) ? ` · ${this.when((scheduledAt ?? before.scheduledAt)!)}` : ''}`;
        await this.crm.logActivity(tx, before.enquiryId, 'VIEWING', line, actor.id, { meta: { viewingId: id, from: before.status, to: status ?? before.status } });
      }
    });
    const parts = [status && status !== before.status ? `${VIEWING_STATUS_LABEL[before.status as ViewingStatusValue]} → ${VIEWING_STATUS_LABEL[status as ViewingStatusValue]}` : null, rescheduled ? 'rescheduled' : null, dto.agentId !== undefined && dto.agentId !== before.agentId ? 'agent' : null].filter(Boolean);
    await this.audit.record({ actorId: actor.id, action: 'viewing.update', entity: 'viewing', entityId: id, target: before.name, summary: `Viewing for ${before.name}: ${parts.join(', ') || 'details'}`, before: { status: before.status, scheduledAt: before.scheduledAt, agentId: before.agentId }, after: { status: status ?? before.status, scheduledAt: scheduledAt === undefined ? before.scheduledAt : scheduledAt, agentId: dto.agentId === undefined ? before.agentId : dto.agentId }, req });
    const nowBooked = status ? BOOKED.includes(status) : BOOKED.includes(before.status);
    const shouldNotify = dto.notify ?? (nowBooked && ((status === 'SCHEDULED' && before.status === 'REQUESTED') || rescheduled));
    await this.afterChange(id, before.status, shouldNotify, actor, { rescheduled, cancelled: status === 'CANCELLED' && before.status !== 'CANCELLED', agentChanged: dto.agentId !== undefined && dto.agentId !== before.agentId });
    return this.get(id, req);
  }

  /**
   * After the visit: how interested they are, what they objected to, any
   * other residence they would rather see, and the next action. Completing
   * a viewing moves the lead to "Viewing completed"; a preferred alternative
   * is added to what the lead is interested in.
   */
  @Post(':id/feedback')
  @HttpCode(200)
  @RequirePermission('enquiry.edit')
  async feedback(@Param('id') id: string, @Body() dto: ViewingFeedbackDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const v = await this.owned(id, actor);
    if (!v.scheduledAt) throw new BadRequestException('Schedule the viewing before recording how it went.');
    if (v.status === 'CANCELLED') throw new BadRequestException('This viewing was cancelled.');
    if (dto.alternativeUnitId) await this.assertUnits([dto.alternativeUnitId], v.developmentId);
    const status: ViewingStatus = dto.status ?? 'COMPLETED';
    await this.prisma.client.$transaction(async (tx) => {
      await tx.viewing.update({
        where: { id },
        data: {
          status,
          interestLevel: (dto.interestLevel as ViewingInterest) ?? null,
          outcome: dto.outcome ?? v.outcome,
          objections: dto.objections ?? null,
          alternativeUnitId: dto.alternativeUnitId ?? null,
          feedbackAt: new Date(),
          feedbackById: actor.id,
        },
      });
      if (!v.enquiryId) return;
      const interest = dto.interestLevel ? VIEWING_INTEREST_LABEL[dto.interestLevel as keyof typeof VIEWING_INTEREST_LABEL] : null;
      const alt = dto.alternativeUnitId ? (await tx.unit.findUnique({ where: { id: dto.alternativeUnitId }, select: { code: true } }))?.code : null;
      const body = status === 'NO_SHOW'
        ? 'Did not attend the viewing'
        : [`Viewing completed${interest ? ` — ${interest.toLowerCase()}` : ''}`, dto.outcome?.trim(), dto.objections?.trim() ? `Objections: ${dto.objections.trim()}` : null, alt ? `Prefers ${alt}` : null].filter(Boolean).join('\n');
      await this.crm.logActivity(tx, v.enquiryId, 'VIEWING', body, actor.id, { meta: { viewingId: id, interestLevel: dto.interestLevel ?? null }, direction: status === 'COMPLETED' ? 'IN' : null });
      if (status === 'COMPLETED') {
        const lead = await tx.enquiry.findUniqueOrThrow({ where: { id: v.enquiryId } });
        await this.crm.moveLead(tx, lead, { status: 'VIEWED' }, actor.id, { forwardOnly: true, reason: 'viewing completed' });
        if (dto.alternativeUnitId) await tx.enquiryUnit.upsert({ where: { enquiryId_unitId: { enquiryId: v.enquiryId, unitId: dto.alternativeUnitId } }, create: { enquiryId: v.enquiryId, unitId: dto.alternativeUnitId }, update: {} });
      }
      if (dto.next) {
        const lead = await tx.enquiry.findUniqueOrThrow({ where: { id: v.enquiryId }, select: { assignedToId: true } });
        await tx.leadTask.create({ data: { developmentId: v.developmentId, enquiryId: v.enquiryId, title: dto.next.title.trim(), type: (dto.next.type as TaskType) ?? 'POST_VIEWING', dueAt: dto.next.dueAt ? new Date(dto.next.dueAt) : null, allDay: dto.next.allDay ?? false, assignedToId: lead.assignedToId ?? actor.id, createdById: actor.id, unitId: dto.alternativeUnitId ?? v.units[0]?.unitId ?? null } });
        await this.crm.syncFollowUp(tx, v.enquiryId);
      }
    });
    await this.audit.record({ actorId: actor.id, action: 'viewing.feedback', entity: 'viewing', entityId: id, target: v.name, summary: `Recorded ${status === 'NO_SHOW' ? 'a no-show' : 'viewing feedback'} for ${v.name}`, before: { status: v.status }, after: { status, interestLevel: dto.interestLevel ?? null }, req });
    if (v.enquiryId) await this.crm.rescore(v.enquiryId);
    return this.get(id, req);
  }

  /** Confirmation email when asked, the lead moved forward (never backward), and the agent told. */
  private async afterChange(id: string, previous: ViewingStatus | null, notify: boolean, actor: Actor, change: { rescheduled?: boolean; cancelled?: boolean; agentChanged?: boolean } = {}) {
    const v = await this.prisma.client.viewing.findUniqueOrThrow({ where: { id }, include: { ...include, development: { select: { name: true, contactPhone: true, officeAddress: true } } } });
    if (notify && isBookedViewing(v.status) && v.scheduledAt && v.email) {
      const mail = emailViewingConfirmation({
        developmentName: v.development.name,
        firstName: v.name.split(/\s+/)[0] ?? v.name,
        at: v.scheduledAt,
        durationMinutes: v.durationMinutes,
        location: v.location ?? v.development.officeAddress,
        agentName: v.agent?.name ?? null,
        residenceCodes: v.units.map((u) => u.unit.code),
        phone: v.development.contactPhone,
      });
      await this.notifications.send({ developmentId: v.developmentId, kind: 'VIEWING_CONFIRMATION', to: v.email, subject: mail.subject, text: mail.text, viewingId: v.id, enquiryId: v.enquiryId });
      await this.prisma.client.viewing.update({ where: { id }, data: { confirmationSentAt: new Date() } });
    }
    if (v.enquiry && isBookedViewing(v.status) && v.status !== previous) {
      const lead = await this.prisma.client.enquiry.findUniqueOrThrow({ where: { id: v.enquiry.id } });
      await this.prisma.client.$transaction((tx) => this.crm.moveLead(tx, lead, { status: 'VIEWING_SCHEDULED' }, actor.id, { forwardOnly: true, reason: 'viewing booked' }));
      await this.crm.rescore(lead.id);
    }
    if (v.agentId && (previous === null || change.rescheduled || change.cancelled || change.agentChanged || (v.status !== previous && isBookedViewing(v.status)))) {
      const what = change.cancelled ? 'cancelled' : change.rescheduled ? 'rescheduled' : previous === null || change.agentChanged ? 'assigned to you' : VIEWING_STATUS_LABEL[v.status as ViewingStatusValue].toLowerCase();
      await this.crm.notify([v.agentId, ...(change.cancelled && v.enquiry?.assignedToId ? [v.enquiry.assignedToId] : [])], {
        kind: change.cancelled ? 'viewing.cancelled' : 'viewing.changed',
        title: `Viewing ${what}: ${v.name}`,
        body: v.scheduledAt ? `${this.when(v.scheduledAt)}${v.units.length ? ` · ${v.units.map((u) => u.unit.code).join(', ')}` : ''}` : 'No time set yet',
        link: v.enquiryId ? `/crm/leads/${v.enquiryId}` : `/viewings?open=${v.id}`,
        enquiryId: v.enquiryId,
      }, actor.id);
    }
  }

  private when(d: Date) {
    return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: process.env.TZ || 'Africa/Kigali' }).format(d);
  }

  private async owned(id: string, actor: Actor) {
    const v = await this.prisma.client.viewing.findFirst({ where: { AND: [{ id, developmentId: await this.dev.id() }, this.scope(actor)] }, include });
    if (!v) throw new NotFoundException('No such viewing');
    return v;
  }

  private async assertUnits(ids: string[] | undefined, developmentId: string) {
    if (!ids?.length) return;
    const n = await this.prisma.client.unit.count({ where: { id: { in: ids }, developmentId } });
    if (n !== ids.length) throw new BadRequestException('Some of those residences do not belong to this property.');
  }

  private async assertAgent(agentId: string | null | undefined) {
    if (!agentId) return;
    const ok = await this.prisma.client.adminUser.count({ where: { id: agentId, active: true } });
    if (!ok) throw new BadRequestException('That agent does not exist or is inactive.');
  }
}
