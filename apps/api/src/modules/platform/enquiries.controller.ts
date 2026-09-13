import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
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
import type { EnquiryStatus, LeadNoteKind, LostReason, Prisma } from '@avida/db';
import { FIRST_RESPONSE_HOURS, isLeadOverdue, LOST_REASON_LABEL, STAGE_LABEL, type LostReasonValue } from '@avida/types';
import { AuditService } from '../../common/audit.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { pageOf, paged } from '../../common/http.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { PrismaService } from '../../common/prisma.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf, assertCan } from './actor.js';
import { BulkEnquiryDto, LeadNoteDto, UpdateEnquiryDto } from './dto.js';

/** §5.9 — an enquiry's retention window moves forward whenever it is worked. */
function nextPurge(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + 24);
  return d;
}

const unitSelect = { id: true, code: true, status: true, priceMinor: true, currency: true, areaSqm: true } as const;

/**
 * §40.3 — the lead desk: every enquiry from the website, worked through the
 * pipeline with an owner, a follow-up date, a history of every touch, and the
 * viewings and reservations it led to. A lead with no first response inside
 * FIRST_RESPONSE_HOURS, or a follow-up date in the past, is overdue and says so.
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
  ) {}

  private async scope(): Promise<Prisma.EnquiryWhereInput> {
    // §40.5 — every lead carries its property; no subquery through its residences.
    return { developmentId: await this.dev.id() };
  }

  private overdueWhere(now = new Date()): Prisma.EnquiryWhereInput {
    return {
      status: { notIn: ['LOST', 'SPAM', 'SOLD'] },
      OR: [{ followUpAt: { lt: now } }, { status: 'NEW', contactedAt: null, createdAt: { lt: new Date(now.getTime() - FIRST_RESPONSE_HOURS * 3_600_000) } }],
    };
  }

  @Get()
  async list(
    @Req() req: AdminRequest,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('unitId') unitId?: string,
    @Query('assignedTo') assignedTo?: string,
    @Query('intent') intent?: string,
    @Query('overdue') overdue?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const p = pageOf(page, pageSize);
    const scope = await this.scope();
    const me = actorOf(req).id;
    const where: Prisma.EnquiryWhereInput = {
      AND: [
        scope,
        status ? { status: { in: status.split(',') as EnquiryStatus[] } } : { status: { not: 'SPAM' } },
        unitId ? { units: { some: { unitId } } } : {},
        assignedTo === 'none' ? { assignedToId: null } : assignedTo === 'me' ? { assignedToId: me } : assignedTo ? { assignedToId: assignedTo } : {},
        intent ? { intent: intent as Prisma.EnquiryWhereInput['intent'] } : {},
        overdue === 'true' ? this.overdueWhere() : {},
        q
          ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }, { message: { contains: q, mode: 'insensitive' } }] }
          : {},
      ],
    };
    const [rows, total, byStatus, overdueCount, mine] = await Promise.all([
      this.prisma.client.enquiry.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        include: {
          units: { include: { unit: { select: unitSelect } } },
          buyer: { select: { id: true, fullName: true } },
          assignedTo: { select: { id: true, name: true } },
          viewings: { where: { status: { in: ['REQUESTED', 'CONFIRMED'] } }, select: { id: true, status: true, scheduledAt: true, requestedDate: true }, take: 1, orderBy: { createdAt: 'desc' } },
          _count: { select: { notes: true } },
        },
        skip: p.skip,
        take: p.take,
      }),
      this.prisma.client.enquiry.count({ where }),
      this.prisma.client.enquiry.groupBy({ by: ['status'], where: scope, _count: true }),
      this.prisma.client.enquiry.count({ where: { AND: [scope, this.overdueWhere()] } }),
      this.prisma.client.enquiry.count({ where: { AND: [scope, { assignedToId: me, status: { notIn: ['LOST', 'SPAM', 'SOLD'] } }] } }),
    ]);
    const now = new Date();
    return {
      ...paged(
        rows.map(({ units, _count, viewings, ...e }) => ({
          ...e,
          units: units.map((u) => u.unit),
          assignedToName: e.assignedTo?.name ?? null,
          noteCount: _count.notes,
          openViewing: viewings[0] ?? null,
          overdue: isLeadOverdue(e, now),
        })),
        total,
        p,
      ),
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      overdue: overdueCount,
      mine,
    };
  }

  @Get('export.csv')
  @RequirePermission('enquiry.export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="enquiries.csv"')
  async exportCsv(@Req() req: AdminRequest) {
    const rows = await this.prisma.client.enquiry.findMany({
      where: await this.scope(),
      orderBy: { createdAt: 'desc' },
      include: { units: { include: { unit: { select: { code: true } } } }, assignedTo: { select: { name: true } } },
      // The same cap as the residences export: a CSV is a report, not a backup.
      take: 5000,
    });
    await this.audit.record({ actorId: actorOf(req).id, action: 'enquiry.export', entity: 'enquiry', target: 'all', summary: `Exported ${rows.length} enquiries`, rowCount: rows.length, req });
    const header = ['id', 'created', 'name', 'email', 'phone', 'country', 'intent', 'stage', 'assigned_to', 'contacted', 'follow_up', 'lost_reason', 'units', 'source', 'utm_source', 'unverified'];
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = rows.map((e) =>
      [e.id, e.createdAt.toISOString(), e.name, e.email, e.phone, e.countryIso, e.intent, e.status, e.assignedTo?.name, e.contactedAt?.toISOString(), e.followUpAt?.toISOString(), e.lostReason, e.units.map((u) => u.unit.code).join(' '), e.source, e.utmSource, e.verificationSkipped ? 'yes' : '']
        .map(escape)
        .join(','),
    );
    return [header.join(','), ...lines].join('\n');
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const enquiry = await this.prisma.client.enquiry.findFirst({
      where: { AND: [{ id }, await this.scope()] },
      include: {
        units: { include: { unit: { select: unitSelect } } },
        buyer: { select: { id: true, fullName: true, stage: true } },
        assignedTo: { select: { id: true, name: true } },
        notes: { orderBy: { createdAt: 'desc' }, include: { author: { select: { name: true } } } },
        viewings: { orderBy: { createdAt: 'desc' }, include: { agent: { select: { id: true, name: true } }, units: { include: { unit: { select: { code: true } } } } } },
        reservations: { orderBy: { createdAt: 'desc' }, include: { unit: { select: { code: true } } } },
        notifications: { orderBy: { createdAt: 'desc' }, select: { id: true, kind: true, recipient: true, status: true, lastError: true, sentAt: true, createdAt: true } },
      },
    });
    if (!enquiry) throw new NotFoundException('No such enquiry');
    const duplicates = await this.prisma.client.enquiry.findMany({
      where: { developmentId: enquiry.developmentId, id: { not: id }, OR: [{ email: enquiry.email }, { phone: enquiry.phone }] },
      select: { id: true, createdAt: true, status: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const { units, notes, viewings, ...rest } = enquiry;
    return {
      ...rest,
      units: units.map((u) => u.unit),
      assignedToName: enquiry.assignedTo?.name ?? null,
      overdue: isLeadOverdue(enquiry),
      notes: notes.map(({ author, ...n }) => ({ ...n, authorName: author?.name ?? 'System' })),
      viewings: viewings.map(({ units: vu, ...v }) => ({ ...v, units: vu.map((x) => x.unit.code) })),
      otherEnquiries: duplicates,
    };
  }

  @Patch(':id')
  @RequirePermission('enquiry.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateEnquiryDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const before = await this.prisma.client.enquiry.findFirst({ where: { AND: [{ id }, await this.scope()] } });
    if (!before) throw new NotFoundException('No such enquiry');
    if (dto.assignedToId) {
      const ok = await this.prisma.client.adminUser.count({ where: { id: dto.assignedToId, active: true } });
      if (!ok) throw new BadRequestException('That team member does not exist or is inactive.');
    }
    if (dto.buyerId) {
      assertCan(actor, 'buyer.edit');
      const ok = await this.prisma.client.buyer.count({ where: { id: dto.buyerId, developmentId: before.developmentId } });
      if (!ok) throw new BadRequestException('That client does not belong to this property.');
    }
    if (dto.status === 'LOST' && !dto.lostReason && !before.lostReason) {
      throw new BadRequestException('Say why the lead was lost — it is what the reports learn from.');
    }
    const now = new Date();
    const stageChanged = dto.status !== undefined && dto.status !== before.status;
    const after = await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.enquiry.update({
        where: { id },
        data: {
          ...(dto.status ? { status: dto.status as EnquiryStatus } : {}),
          ...(dto.assignedToId !== undefined ? { assignedToId: dto.assignedToId } : {}),
          ...(dto.followUpAt !== undefined ? { followUpAt: dto.followUpAt ? new Date(dto.followUpAt) : null } : {}),
          ...(dto.lostReason !== undefined ? { lostReason: dto.lostReason as LostReason | null } : {}),
          ...(dto.lostNote !== undefined ? { lostNote: dto.lostNote } : {}),
          ...(dto.buyerId !== undefined ? { buyerId: dto.buyerId } : {}),
          // §15.3 — the first move off NEW is the first response.
          ...(stageChanged && !before.contactedAt && dto.status !== 'SPAM' ? { contactedAt: now } : {}),
          lastActivityAt: now,
          purgeAfter: nextPurge(),
        },
      });
      if (stageChanged) {
        const reason = (dto.lostReason ?? before.lostReason) as LostReasonValue | null;
        await tx.leadNote.create({
          data: {
            enquiryId: id,
            authorId: actor.id,
            kind: 'STATUS',
            body: `${STAGE_LABEL[before.status] ?? before.status} → ${STAGE_LABEL[dto.status!] ?? dto.status}${dto.status === 'LOST' && reason ? ` (${LOST_REASON_LABEL[reason]})` : ''}`,
          },
        });
      }
      return row;
    });
    const parts = [
      stageChanged ? `stage ${STAGE_LABEL[before.status]} → ${STAGE_LABEL[dto.status!]}` : null,
      dto.assignedToId !== undefined && dto.assignedToId !== before.assignedToId ? 'owner' : null,
      dto.followUpAt !== undefined ? 'follow-up date' : null,
      dto.buyerId !== undefined && dto.buyerId !== before.buyerId ? 'client' : null,
    ].filter(Boolean);
    if (parts.length) {
      await this.audit.record({ actorId: actor.id, action: 'enquiry.update', entity: 'enquiry', entityId: id, target: before.name, summary: `Lead ${before.name}: ${parts.join(', ')}`, before: { status: before.status }, after: { status: after.status }, req });
    }
    return after;
  }

  /** §15.4 — a note, call or message, added to the lead's history. Never overwrites. */
  @Post(':id/notes')
  @RequirePermission('enquiry.edit')
  async addNote(@Param('id') id: string, @Body() dto: LeadNoteDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const lead = await this.prisma.client.enquiry.findFirst({ where: { AND: [{ id }, await this.scope()] }, select: { id: true, name: true, contactedAt: true, status: true } });
    if (!lead) throw new NotFoundException('No such enquiry');
    const now = new Date();
    const touch = dto.kind !== 'NOTE';
    const [note] = await this.prisma.client.$transaction([
      this.prisma.client.leadNote.create({ data: { enquiryId: id, authorId: actor.id, kind: dto.kind as LeadNoteKind, body: dto.body.trim() }, include: { author: { select: { name: true } } } }),
      this.prisma.client.enquiry.update({
        where: { id },
        data: {
          lastActivityAt: now,
          purgeAfter: nextPurge(),
          // Calling, emailing or meeting a new lead is the first response.
          ...(touch && !lead.contactedAt ? { contactedAt: now, ...(lead.status === 'NEW' ? { status: 'CONTACTED' as EnquiryStatus } : {}) } : {}),
          ...(dto.followUpAt !== undefined ? { followUpAt: dto.followUpAt ? new Date(dto.followUpAt) : null } : {}),
        },
      }),
    ]);
    await this.audit.record({ actorId: actor.id, action: 'enquiry.note', entity: 'enquiry', entityId: id, target: lead.name, summary: `Logged a ${dto.kind.toLowerCase()} on lead ${lead.name}`, req });
    return { ...note, authorName: note.author?.name ?? null };
  }

  /** §15.9 — assign, move or mark spam many leads at once. */
  @Post('bulk')
  @HttpCode(200)
  @RequirePermission('enquiry.edit')
  async bulk(@Body() dto: BulkEnquiryDto, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    const developmentId = await this.dev.id();
    const leads = await this.prisma.client.enquiry.findMany({ where: { id: { in: dto.ids }, developmentId }, select: { id: true, status: true, contactedAt: true } });
    if (leads.length !== dto.ids.length) throw new NotFoundException('Some enquiries were not found.');
    const now = new Date();
    if (dto.action === 'assign') {
      if (dto.assignedToId) {
        const ok = await this.prisma.client.adminUser.count({ where: { id: dto.assignedToId, active: true } });
        if (!ok) throw new BadRequestException('That team member does not exist or is inactive.');
      }
      await this.prisma.client.enquiry.updateMany({ where: { id: { in: dto.ids } }, data: { assignedToId: dto.assignedToId ?? null, lastActivityAt: now } });
    } else {
      const status = (dto.action === 'spam' ? 'SPAM' : dto.status) as EnquiryStatus | undefined;
      if (!status) throw new BadRequestException('Choose the stage to move the leads to.');
      if (status === 'LOST' && !dto.lostReason) throw new BadRequestException('Say why the leads were lost.');
      await this.prisma.client.$transaction([
        this.prisma.client.enquiry.updateMany({ where: { id: { in: dto.ids } }, data: { status, lastActivityAt: now, purgeAfter: nextPurge(), ...(dto.lostReason ? { lostReason: dto.lostReason as LostReason } : {}) } }),
        this.prisma.client.enquiry.updateMany({ where: { id: { in: dto.ids }, contactedAt: null, status: { not: 'SPAM' } }, data: { contactedAt: now } }),
        this.prisma.client.leadNote.createMany({ data: leads.filter((l) => l.status !== status).map((l) => ({ enquiryId: l.id, authorId: actor.id, kind: 'STATUS' as LeadNoteKind, body: `${STAGE_LABEL[l.status]} → ${STAGE_LABEL[status]} (bulk)` })) }),
      ]);
    }
    // One audit row for the batch, not one per lead (audit §20).
    await this.audit.record({ actorId: actor.id, action: `enquiry.bulk.${dto.action}`, entity: 'enquiry', summary: `${dto.action === 'assign' ? 'Assigned' : dto.action === 'spam' ? 'Marked as spam' : `Moved to ${STAGE_LABEL[dto.status ?? ''] ?? dto.status}`} ${dto.ids.length} leads`, rowCount: dto.ids.length, req });
    return { ok: true, count: dto.ids.length };
  }

  /** §13 — an enquiry becomes a client record, keeping the residences they asked about. */
  @Post(':id/convert')
  @RequirePermission('enquiry.edit')
  async convert(@Param('id') id: string, @Req() req: AdminRequest) {
    const actor = actorOf(req);
    assertCan(actor, 'buyer.edit');
    const enquiry = await this.prisma.client.enquiry.findFirst({ where: { AND: [{ id }, await this.scope()] }, include: { units: true } });
    if (!enquiry) throw new NotFoundException('No such enquiry');
    if (enquiry.buyerId) throw new ConflictException('This enquiry is already linked to a client.');
    const developmentId = enquiry.developmentId;
    const existing = await this.prisma.client.buyer.findFirst({ where: { developmentId, email: { equals: enquiry.email, mode: 'insensitive' }, archivedAt: null } });

    const buyer = await this.prisma.client.$transaction(async (tx) => {
      const b =
        existing ??
        (await tx.buyer.create({
          data: {
            developmentId,
            fullName: enquiry.name,
            email: enquiry.email,
            phone: enquiry.phone,
            countryIso: enquiry.countryIso,
            stage: enquiry.units.length ? 'INTERESTED' : 'ENQUIRY',
            source: enquiry.source ? `Website (${enquiry.source})` : 'Website enquiry',
            assignedToId: enquiry.assignedToId,
          },
        }));
      for (const u of enquiry.units) {
        await tx.buyerInterest.upsert({ where: { buyerId_unitId: { buyerId: b.id, unitId: u.unitId } }, create: { buyerId: b.id, unitId: u.unitId }, update: {} });
      }
      await tx.enquiry.update({ where: { id }, data: { buyerId: b.id, status: enquiry.status === 'NEW' ? 'QUALIFIED' : enquiry.status, contactedAt: enquiry.contactedAt ?? new Date(), lastActivityAt: new Date(), purgeAfter: nextPurge() } });
      await tx.leadNote.create({ data: { enquiryId: id, authorId: actor.id, kind: 'SYSTEM', body: existing ? `Linked to existing client ${b.fullName}.` : `Became client ${b.fullName}.` } });
      return b;
    });

    await this.audit.record({ actorId: actor.id, action: 'enquiry.convert', entity: 'enquiry', entityId: id, target: enquiry.name, summary: existing ? `Linked enquiry to existing client ${buyer.fullName}` : `Converted enquiry into client ${buyer.fullName}`, req });
    if (!existing) await this.audit.record({ actorId: actor.id, action: 'buyer.create', entity: 'buyer', entityId: buyer.id, target: buyer.fullName, summary: `Client ${buyer.fullName} from a website enquiry`, req });
    return buyer;
  }
}
