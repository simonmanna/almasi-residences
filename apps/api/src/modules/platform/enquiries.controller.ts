import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { EnquiryStatus, Prisma } from '@avida/db';
import { assertCan, actorOf } from './actor.js';
import { humanise } from '@avida/types';
import { AuditService } from '../../common/audit.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { pageOf, paged } from '../../common/http.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { PrismaService } from '../../common/prisma.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { UpdateEnquiryDto } from './dto.js';

/** §5.9 — an enquiry's retention window moves forward whenever it is worked. */
function nextPurge(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + 24);
  return d;
}

/** §14 — every website enquiry, worked by the sales team. */
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

  @Get()
  async list(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('unitId') unitId?: string,
    @Query('assignedTo') assignedTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const p = pageOf(page, pageSize);
    const where: Prisma.EnquiryWhereInput = {
      AND: [
        await this.scope(),
        status ? { status: { in: status.split(',') as EnquiryStatus[] } } : {},
        unitId ? { units: { some: { unitId } } } : {},
        assignedTo ? { assignedTo } : {},
        q
          ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }, { message: { contains: q, mode: 'insensitive' } }] }
          : {},
      ],
    };
    const [rows, total, byStatus, users] = await Promise.all([
      this.prisma.client.enquiry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { units: { include: { unit: { select: { id: true, code: true, priceMinor: true, currency: true, status: true } } } }, buyer: { select: { id: true, fullName: true } } },
        skip: p.skip,
        take: p.take,
      }),
      this.prisma.client.enquiry.count({ where }),
      this.prisma.client.enquiry.groupBy({ by: ['status'], where: await this.scope(), _count: true }),
      this.prisma.client.adminUser.findMany({ select: { id: true, name: true } }),
    ]);
    const names = new Map(users.map((u) => [u.id, u.name]));
    return {
      ...paged(
        rows.map((e) => ({ ...e, units: e.units.map((u) => u.unit), assignedToName: e.assignedTo ? (names.get(e.assignedTo) ?? null) : null })),
        total,
        p,
      ),
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
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
      include: { units: { include: { unit: { select: { code: true } } } } },
      // The same cap as the residences export: a CSV is a report, not a backup.
      take: 5000,
    });
    await this.audit.record({ actorId: actorOf(req).id, action: 'enquiry.export', entity: 'enquiry', target: 'all', summary: `Exported ${rows.length} enquiries`, rowCount: rows.length, req });
    const header = ['id', 'created', 'name', 'email', 'phone', 'country', 'intent', 'status', 'units', 'source', 'utm_source', 'unverified'];
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = rows.map((e) =>
      [e.id, e.createdAt.toISOString(), e.name, e.email, e.phone, e.countryIso, e.intent, e.status, e.units.map((u) => u.unit.code).join(' '), e.source, e.utmSource, e.verificationSkipped ? 'yes' : '']
        .map(escape)
        .join(','),
    );
    return [header.join(','), ...lines].join('\n');
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const enquiry = await this.prisma.client.enquiry.findFirst({
      where: { AND: [{ id }, await this.scope()] },
      include: { units: { include: { unit: { select: { id: true, code: true, status: true, priceMinor: true, currency: true, areaSqm: true } } } }, buyer: { select: { id: true, fullName: true, stage: true } } },
    });
    if (!enquiry) throw new NotFoundException('No such enquiry');
    const activity = await this.prisma.client.adminAuditLog.findMany({
      where: { entity: 'enquiry', entityId: id },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { name: true } } },
    });
    return { ...enquiry, units: enquiry.units.map((u) => u.unit), activity: activity.map(({ actor, ...a }) => ({ ...a, actorName: actor.name })) };
  }

  @Patch(':id')
  @RequirePermission('enquiry.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateEnquiryDto, @Req() req: AdminRequest) {
    const before = await this.prisma.client.enquiry.findFirst({ where: { AND: [{ id }, await this.scope()] } });
    if (!before) throw new NotFoundException('No such enquiry');
    if (dto.assignedTo) {
      const ok = await this.prisma.client.adminUser.count({ where: { id: dto.assignedTo, active: true } });
      if (!ok) throw new BadRequestException('That team member does not exist or is inactive.');
    }
    if (dto.buyerId) {
      assertCan(actorOf(req), 'buyer.edit');
      const ok = await this.prisma.client.buyer.count({ where: { id: dto.buyerId, developmentId: await this.dev.id() } });
      if (!ok) throw new BadRequestException('That client does not belong to this property.');
    }
    const after = await this.prisma.client.enquiry.update({
      where: { id },
      data: {
        ...(dto.status ? { status: dto.status as Prisma.EnquiryUpdateInput['status'] } : {}),
        ...(dto.assignedTo !== undefined ? { assignedTo: dto.assignedTo } : {}),
        ...(dto.internalNote !== undefined ? { internalNote: dto.internalNote } : {}),
        ...(dto.buyerId !== undefined ? { buyerId: dto.buyerId } : {}),
        purgeAfter: nextPurge(),
      },
    });
    const parts = [
      dto.status && dto.status !== before.status ? `status ${humanise(before.status)} → ${humanise(dto.status)}` : null,
      dto.assignedTo !== undefined && dto.assignedTo !== before.assignedTo ? 'assignee' : null,
      dto.internalNote !== undefined && dto.internalNote !== before.internalNote ? 'note' : null,
      dto.buyerId !== undefined && dto.buyerId !== before.buyerId ? 'client' : null,
    ].filter(Boolean);
    if (parts.length) {
      await this.audit.record({ actorId: actorOf(req).id, action: 'enquiry.update', entity: 'enquiry', entityId: id, target: before.name, summary: `Enquiry from ${before.name}: ${parts.join(', ')}`, before: { status: before.status }, after: { status: after.status }, req });
    }
    return after;
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
    const developmentId = await this.dev.id();
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
            assignedToId: enquiry.assignedTo,
          },
        }));
      for (const u of enquiry.units) {
        await tx.buyerInterest.upsert({ where: { buyerId_unitId: { buyerId: b.id, unitId: u.unitId } }, create: { buyerId: b.id, unitId: u.unitId }, update: {} });
      }
      await tx.enquiry.update({ where: { id }, data: { buyerId: b.id, status: enquiry.status === 'NEW' ? 'QUALIFIED' : enquiry.status, purgeAfter: nextPurge() } });
      return b;
    });

    await this.audit.record({ actorId: actor.id, action: 'enquiry.convert', entity: 'enquiry', entityId: id, target: enquiry.name, summary: existing ? `Linked enquiry to existing client ${buyer.fullName}` : `Converted enquiry into client ${buyer.fullName}`, req });
    await this.audit.record({ actorId: actor.id, action: 'buyer.create', entity: 'buyer', entityId: buyer.id, target: buyer.fullName, summary: `Client ${buyer.fullName} from a website enquiry`, req });
    return buyer;
  }
}
