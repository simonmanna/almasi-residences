import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { canTransition, type UnitStatus } from '@avida/types';
import { PrismaService } from '../../common/prisma.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { RevalidateService } from './revalidate.service.js';

@Injectable()
export class AdminService {
  private readonly log = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly revalidate: RevalidateService,
  ) {}

  async listUnits(params: { status?: string; typology?: string; q?: string }) {
    const units = await this.prisma.client.unit.findMany({
      where: {
        ...(params.status ? { status: params.status as UnitStatus } : {}),
        ...(params.typology ? { typology: { slug: params.typology } } : {}),
        ...(params.q ? { code: { contains: params.q, mode: 'insensitive' } } : {}),
      },
      orderBy: [{ floor: { level: 'desc' } }, { positionIndex: 'asc' }],
      select: {
        id: true,
        code: true,
        status: true,
        priceMinor: true,
        currency: true,
        areaSqm: true,
        orientation: true,
        notes: true,
        floor: { select: { level: true, label: true } },
        typology: { select: { slug: true, name: true } },
      },
    });
    return { data: units, meta: { total: units.length } };
  }

  /**
   * §5.5 — the transition rules live here, not in the admin UI, so a crafted
   * request cannot skip a stage. Every change writes a log row, busts the cache
   * and triggers revalidation.
   */
  async changeStatus(params: {
    unitIds: string[];
    status: UnitStatus;
    actorId: string;
    actorRole: string;
  }) {
    const units = await this.prisma.client.unit.findMany({
      where: { id: { in: params.unitIds } },
      select: {
        id: true,
        code: true,
        status: true,
        floor: {
          select: { building: { select: { development: { select: { slug: true } } } } },
        },
      },
    });
    if (units.length === 0) throw new BadRequestException('No matching units');

    for (const unit of units) {
      if (unit.status === params.status) continue;
      // §5.5 — only an OWNER may reverse a sale.
      if (unit.status === 'SOLD' && params.actorRole !== 'OWNER') {
        throw new ForbiddenException(
          `Unit ${unit.code} is sold. Only an owner can change a sold unit.`,
        );
      }
      if (unit.status !== 'SOLD' && !canTransition(unit.status, params.status)) {
        throw new BadRequestException(
          `Unit ${unit.code} cannot go from ${unit.status.toLowerCase()} to ${params.status.toLowerCase()}.`,
        );
      }
    }

    const changed = units.filter((u) => u.status !== params.status);

    await this.prisma.client.$transaction([
      this.prisma.client.unit.updateMany({
        where: { id: { in: changed.map((u) => u.id) } },
        data: { status: params.status },
      }),
      this.prisma.client.unitStatusLog.createMany({
        data: changed.map((u) => ({
          unitId: u.id,
          from: u.status,
          to: params.status,
          actor: params.actorId,
        })),
      }),
    ]);

    const slugs = [...new Set(units.map((u) => u.floor.building.development.slug))];
    for (const slug of slugs) {
      await this.inventory.bustCache(slug);
      // §11 — tell Next.js to rebuild the affected pages. The public site also
      // polls /inventory/live every 60s, so the 60-second guarantee in §9 holds
      // even if this call fails.
      void this.revalidate.developmentChanged(slug);
    }

    await this.audit(params.actorId, 'unit.bulk-status', params.status, changed.length);
    return { changed: changed.length, unchanged: units.length - changed.length };
  }

  async updateUnit(id: string, data: { priceMinor?: number; notes?: string }, actorId: string) {
    const unit = await this.prisma.client.unit.update({
      where: { id },
      data,
      select: {
        id: true,
        code: true,
        priceMinor: true,
        currency: true,
        floor: { select: { building: { select: { development: { select: { slug: true } } } } } },
      },
    });
    const slug = unit.floor.building.development.slug;
    await this.inventory.bustCache(slug);
    void this.revalidate.developmentChanged(slug);
    await this.audit(actorId, 'unit.update', unit.code, 1);
    return unit;
  }

  unitHistory(id: string) {
    return this.prisma.client.unitStatusLog.findMany({
      where: { unitId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listEnquiries(params: { status?: string }) {
    const data = await this.prisma.client.enquiry.findMany({
      where: params.status ? { status: params.status as never } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        units: { include: { unit: { select: { code: true, priceMinor: true, currency: true } } } },
      },
    });
    return { data, meta: { total: data.length } };
  }

  updateEnquiry(id: string, data: { status?: string; assignedTo?: string; internalNote?: string }) {
    // §5.9 — touching an enquiry pushes its retention window forward.
    const purgeAfter = new Date();
    purgeAfter.setMonth(purgeAfter.getMonth() + 24);
    return this.prisma.client.enquiry.update({
      where: { id },
      data: {
        ...(data.status ? { status: data.status as never } : {}),
        ...(data.assignedTo !== undefined ? { assignedTo: data.assignedTo } : {}),
        ...(data.internalNote !== undefined ? { internalNote: data.internalNote } : {}),
        purgeAfter,
      },
    });
  }

  /** §5.9 — exporting the customer list is an audited action. */
  async exportEnquiriesCsv(actorId: string, ip?: string): Promise<string> {
    const rows = await this.prisma.client.enquiry.findMany({
      orderBy: { createdAt: 'desc' },
      include: { units: { include: { unit: { select: { code: true } } } } },
    });

    await this.audit(actorId, 'enquiry.export', 'all', rows.length, ip);

    const header = [
      'id',
      'created',
      'name',
      'email',
      'phone',
      'intent',
      'status',
      'units',
      'source',
      'utm_source',
      'unverified',
    ];
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = rows.map((e) =>
      [
        e.id,
        e.createdAt.toISOString(),
        e.name,
        e.email,
        e.phone,
        e.intent,
        e.status,
        e.units.map((u) => u.unit.code).join(' '),
        e.source,
        e.utmSource,
        e.verificationSkipped ? 'yes' : '',
      ]
        .map(escape)
        .join(','),
    );
    return [header.join(','), ...lines].join('\n');
  }

  async dashboard() {
    const [byStatus, enquiries, recent] = await Promise.all([
      this.prisma.client.unit.groupBy({ by: ['status'], _count: true }),
      this.prisma.client.enquiry.groupBy({ by: ['status'], _count: true }),
      this.prisma.client.unitStatusLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { unit: { select: { code: true } } },
      }),
    ]);
    return {
      units: Object.fromEntries(byStatus.map((r) => [r.status, r._count])),
      enquiries: Object.fromEntries(enquiries.map((r) => [r.status, r._count])),
      recentChanges: recent,
    };
  }

  private async audit(
    actorId: string,
    action: string,
    target: string,
    rowCount: number,
    ip?: string,
  ) {
    await this.prisma.client.adminAuditLog.create({
      data: { actorId, action, target, rowCount, ip: ip ?? null },
    });
    this.log.log(`${action} by ${actorId} — ${rowCount} rows`);
  }
}
