import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Prisma } from '@avida/db';
import { pageOf, paged } from '../../common/http.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { PrismaService } from '../../common/prisma.service.js';
import { AdminGuard, RequirePermission } from '../admin/admin.guard.js';

/** §28 — the audit log, read-only. */
@Controller('admin/audit')
@UseGuards(AdminGuard)
@RequirePermission('audit.view')
@UseInterceptors(NoStoreInterceptor)
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query() q: Record<string, string | undefined>) {
    const p = pageOf(q.page, q.pageSize ?? '50');
    const where: Prisma.AdminAuditLogWhereInput = {
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.entity ? { entity: q.entity } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.from || q.to
        ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999Z`) } : {}) } }
        : {}),
      ...(q.q
        ? { OR: [{ summary: { contains: q.q, mode: 'insensitive' } }, { target: { contains: q.q, mode: 'insensitive' } }, { action: { contains: q.q, mode: 'insensitive' } }] }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.client.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { id: true, name: true, role: true } } },
        skip: p.skip,
        take: p.take,
      }),
      this.prisma.client.adminAuditLog.count({ where }),
    ]);
    return paged(rows, total, p);
  }

  @Get('facets')
  async facets() {
    const [actions, entities, actors] = await Promise.all([
      this.prisma.client.adminAuditLog.groupBy({ by: ['action'], _count: true, orderBy: { action: 'asc' } }),
      this.prisma.client.adminAuditLog.groupBy({ by: ['entity'], _count: true, where: { entity: { not: null } }, orderBy: { entity: 'asc' } }),
      this.prisma.client.adminUser.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    return {
      actions: actions.map((a) => ({ value: a.action, count: a._count })),
      entities: entities.map((e) => ({ value: e.entity, count: e._count })),
      actors,
    };
  }
}
