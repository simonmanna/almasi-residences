import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { EnquiryStatus, Prisma, ViewingStatus } from '@avida/db';
import { emailViewingConfirmation, VIEWING_STATUS_LABEL, type ViewingStatusValue } from '@avida/types';
import { AuditService } from '../../common/audit.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { NotificationService } from '../../common/notification.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf } from './actor.js';
import { CreateViewingDto, UpdateViewingDto } from './dto.js';

const include = {
  agent: { select: { id: true, name: true } },
  enquiry: { select: { id: true, status: true } },
  units: { include: { unit: { select: { id: true, code: true } } } },
} satisfies Prisma.ViewingInclude;

/** Where a viewing moves the lead it came from (§40.3). */
const LEAD_STAGE: Partial<Record<ViewingStatusValue, EnquiryStatus>> = { CONFIRMED: 'VIEWING_SCHEDULED', COMPLETED: 'VIEWED' };
const STAGE_ORDER: EnquiryStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING_SCHEDULED', 'VIEWED', 'INTERESTED', 'RESERVED', 'SOLD'];

/**
 * §15.2 — viewings as a real workflow: a visitor requests a day and a part of
 * the day, the sales team confirms a time and an agent, the visitor gets a
 * confirmation and (from the worker) a reminder the day before, and the
 * outcome moves the lead along the pipeline.
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
  ) {}

  /** The calendar: confirmed viewings in a date range, plus every request still waiting for a time. */
  @Get()
  async list(@Query('from') from?: string, @Query('to') to?: string, @Query('agentId') agentId?: string, @Query('status') status?: string) {
    const developmentId = await this.dev.id();
    const start = from && !Number.isNaN(Date.parse(from)) ? new Date(from) : new Date(Date.now() - 7 * 86_400_000);
    const end = to && !Number.isNaN(Date.parse(to)) ? new Date(to) : new Date(start.getTime() + 42 * 86_400_000);
    const [scheduled, requests, counts] = await Promise.all([
      this.prisma.client.viewing.findMany({
        where: { developmentId, scheduledAt: { gte: start, lt: end }, ...(agentId ? { agentId } : {}), ...(status ? { status: status as ViewingStatus } : {}) },
        orderBy: { scheduledAt: 'asc' },
        include,
      }),
      this.prisma.client.viewing.findMany({ where: { developmentId, status: 'REQUESTED', scheduledAt: null }, orderBy: [{ requestedDate: 'asc' }, { createdAt: 'asc' }], include }),
      this.prisma.client.viewing.groupBy({ by: ['status'], where: { developmentId, createdAt: { gte: new Date(Date.now() - 90 * 86_400_000) } }, _count: true }),
    ]);
    const shape = (v: (typeof scheduled)[number]) => ({ ...v, units: v.units.map((u) => u.unit) });
    return { scheduled: scheduled.map(shape), requests: requests.map(shape), counts: Object.fromEntries(counts.map((c) => [c.status, c._count])), range: { from: start, to: end } };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const v = await this.owned(id);
    const notifications = await this.prisma.client.notification.findMany({ where: { viewingId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, kind: true, status: true, recipient: true, sentAt: true, lastError: true } });
    return { ...v, units: v.units.map((u) => u.unit), notifications };
  }

  @Post()
  @RequirePermission('enquiry.edit')
  async create(@Body() dto: CreateViewingDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    let person = { name: dto.name, email: dto.email, phone: dto.phone };
    if (dto.enquiryId) {
      const lead = await this.prisma.client.enquiry.findFirst({ where: { id: dto.enquiryId, developmentId }, include: { units: true } });
      if (!lead) throw new BadRequestException('That enquiry does not belong to this property.');
      person = { name: lead.name, email: lead.email, phone: lead.phone };
      dto.unitIds ??= lead.units.map((u) => u.unitId);
    }
    if (!person.name || !person.email || !person.phone) throw new BadRequestException('A viewing needs the visitor’s name, email and phone.');
    await this.assertUnits(dto.unitIds, developmentId);
    await this.assertAgent(dto.agentId);
    const viewing = await this.prisma.client.viewing.create({
      data: {
        developmentId,
        enquiryId: dto.enquiryId ?? null,
        buyerId: dto.buyerId ?? null,
        name: person.name,
        email: person.email.toLowerCase(),
        phone: person.phone,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        durationMinutes: dto.durationMinutes ?? 45,
        agentId: dto.agentId ?? actorOf(req).id,
        status: dto.scheduledAt ? 'CONFIRMED' : 'REQUESTED',
        location: dto.location ?? null,
        notes: dto.notes ?? null,
        units: dto.unitIds?.length ? { create: dto.unitIds.map((unitId) => ({ unitId })) } : undefined,
      },
      include,
    });
    await this.audit.record({ actorId: actorOf(req).id, action: 'viewing.create', entity: 'viewing', entityId: viewing.id, target: viewing.name, summary: `Booked a viewing for ${viewing.name}${viewing.scheduledAt ? ` on ${viewing.scheduledAt.toISOString().slice(0, 10)}` : ''}`, req });
    await this.afterChange(viewing.id, null, dto.notify !== false, actorOf(req).id);
    return this.get(viewing.id);
  }

  @Patch(':id')
  @RequirePermission('enquiry.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateViewingDto, @Req() req: AdminRequest) {
    const before = await this.owned(id);
    const developmentId = before.developmentId;
    await this.assertUnits(dto.unitIds, developmentId);
    await this.assertAgent(dto.agentId);
    const scheduledAt = dto.scheduledAt === undefined ? undefined : dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    let status = dto.status as ViewingStatus | undefined;
    if (!status && scheduledAt && before.status === 'REQUESTED') status = 'CONFIRMED';
    if (status === 'CONFIRMED' && !(scheduledAt ?? before.scheduledAt)) throw new BadRequestException('Choose the date and time before confirming the viewing.');
    const rescheduled = scheduledAt !== undefined && scheduledAt?.getTime() !== before.scheduledAt?.getTime();

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
          ...(rescheduled ? { reminderSentAt: null } : {}),
        },
      });
      if (dto.unitIds) {
        await tx.viewingUnit.deleteMany({ where: { viewingId: id } });
        if (dto.unitIds.length) await tx.viewingUnit.createMany({ data: dto.unitIds.map((unitId) => ({ viewingId: id, unitId })) });
      }
    });
    const parts = [status && status !== before.status ? `${VIEWING_STATUS_LABEL[before.status as ViewingStatusValue]} → ${VIEWING_STATUS_LABEL[status as ViewingStatusValue]}` : null, rescheduled ? 'rescheduled' : null, dto.agentId !== undefined && dto.agentId !== before.agentId ? 'agent' : null].filter(Boolean);
    await this.audit.record({ actorId: actorOf(req).id, action: 'viewing.update', entity: 'viewing', entityId: id, target: before.name, summary: `Viewing for ${before.name}: ${parts.join(', ') || 'details'}`, req });
    const shouldNotify = dto.notify ?? ((status === 'CONFIRMED' && before.status !== 'CONFIRMED') || (rescheduled && (status ?? before.status) === 'CONFIRMED'));
    await this.afterChange(id, before.status, shouldNotify, actorOf(req).id);
    return this.get(id);
  }

  /** Confirmation email when asked, and the lead moved forward (never backward) by the viewing's outcome. */
  private async afterChange(id: string, previous: ViewingStatus | null, notify: boolean, actorId: string) {
    const v = await this.prisma.client.viewing.findUniqueOrThrow({ where: { id }, include: { ...include, development: { select: { name: true, contactPhone: true, officeAddress: true } } } });
    if (notify && v.status === 'CONFIRMED' && v.scheduledAt) {
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
    const target = LEAD_STAGE[v.status as ViewingStatusValue];
    if (v.enquiry && target && v.status !== previous && STAGE_ORDER.indexOf(v.enquiry.status) < STAGE_ORDER.indexOf(target)) {
      await this.prisma.client.$transaction([
        this.prisma.client.enquiry.update({ where: { id: v.enquiry.id }, data: { status: target, lastActivityAt: new Date(), contactedAt: undefined } }),
        this.prisma.client.enquiry.updateMany({ where: { id: v.enquiry.id, contactedAt: null }, data: { contactedAt: new Date() } }),
        this.prisma.client.leadNote.create({ data: { enquiryId: v.enquiry.id, authorId: actorId, kind: 'STATUS', body: `Viewing ${VIEWING_STATUS_LABEL[v.status as ViewingStatusValue].toLowerCase()} → lead moved to ${target === 'VIEWED' ? 'Viewed' : 'Viewing scheduled'}` } }),
      ]);
    }
  }

  private async owned(id: string) {
    const v = await this.prisma.client.viewing.findFirst({ where: { id, developmentId: await this.dev.id() }, include });
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
