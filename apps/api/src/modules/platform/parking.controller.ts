import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import type { Prisma } from '@avida/db';
import { can, PARKING_STATUSES, PARKING_TYPES } from '@avida/types';
import { AuditService, diff } from '../../common/audit.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { rethrowPrisma } from '../../common/http.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { PrismaService } from '../../common/prisma.service.js';
import { PublicSync } from '../../common/public-sync.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf, defined, requireNonNull } from './actor.js';
import { CreateParkingDto, UpdateParkingDto } from './dto.js';

/** §20 — parking bays. Statistics are counted from the rows. */
@Controller('admin/parking')
@UseGuards(AdminGuard)
@UseInterceptors(NoStoreInterceptor)
export class ParkingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly audit: AuditService,
    private readonly sync: PublicSync,
  ) {}

  @Get()
  @RequirePermission('parking.view')
  async list(@Req() req: AdminRequest, @Query('status') status?: string, @Query('type') type?: string, @Query('q') q?: string) {
    const developmentId = await this.dev.id();
    const where: Prisma.ParkingSpaceWhereInput = {
      developmentId,
      ...(status ? { status: status as Prisma.ParkingSpaceWhereInput['status'] } : {}),
      ...(type ? { type: type as Prisma.ParkingSpaceWhereInput['type'] } : {}),
      ...(q ? { OR: [{ code: { contains: q, mode: 'insensitive' } }, { unit: { code: { contains: q, mode: 'insensitive' } } }] } : {}),
    };
    // Statistics are two grouped counts, not a second full scan (roadmap item 58).
    const [rows, byStatus, byType, total] = await Promise.all([
      this.prisma.client.parkingSpace.findMany({
        where,
        orderBy: { code: 'asc' },
        include: { unit: { select: { id: true, code: true, status: true } }, resident: { select: { id: true, fullName: true } } },
      }),
      this.prisma.client.parkingSpace.groupBy({ by: ['status'], where: { developmentId }, _count: true }),
      this.prisma.client.parkingSpace.groupBy({ by: ['type'], where: { developmentId }, _count: true }),
      this.prisma.client.parkingSpace.count({ where: { developmentId } }),
    ]);
    const showPeople = can(actorOf(req).role, 'resident.view');
    return {
      data: rows.map((r) => ({ ...r, resident: showPeople ? r.resident : r.resident ? { id: r.resident.id, fullName: 'Assigned' } : null })),
      stats: {
        total,
        byStatus: Object.fromEntries(PARKING_STATUSES.map((st) => [st, byStatus.find((b) => b.status === st)?._count ?? 0])),
        byType: Object.fromEntries(PARKING_TYPES.map((t) => [t, byType.find((b) => b.type === t)?._count ?? 0])),
      },
    };
  }

  @Post()
  @RequirePermission('parking.edit')
  async create(@Body() dto: CreateParkingDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    await this.validate(dto, developmentId);
    const row = await this.prisma.client.parkingSpace
      .create({
        data: {
          developmentId,
          code: dto.code.trim(),
          level: dto.level ?? 'Basement',
          type: (dto.type ?? 'STANDARD') as Prisma.ParkingSpaceCreateInput['type'],
          sizeSqm: dto.sizeSqm ?? null,
          status: (dto.status ?? 'AVAILABLE') as Prisma.ParkingSpaceCreateInput['status'],
          unitId: dto.unitId ?? null,
          residentId: dto.residentId ?? null,
          priceMinor: dto.priceMinor ?? null,
          notes: dto.notes ?? null,
        },
      })
      .catch((e) => rethrowPrisma(e, { unique: `Bay ${dto.code} already exists.` }));
    await this.audit.record({ actorId: actorOf(req).id, action: 'parking.create', entity: 'parking', entityId: row.id, target: row.code, summary: `Added parking bay ${row.code}`, req });
    await this.sync.changed('inventory');
    return row;
  }

  @Patch(':id')
  @RequirePermission('parking.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateParkingDto, @Req() req: AdminRequest) {
    requireNonNull(dto, ['code', 'level', 'type', 'status']);
    const developmentId = await this.dev.id();
    const before = await this.prisma.client.parkingSpace.findFirst({ where: { id, developmentId } });
    if (!before) throw new NotFoundException('No such parking bay');
    await this.validate({ ...before, ...dto } as CreateParkingDto, developmentId);
    const after = await this.prisma.client.parkingSpace
      .update({
        where: { id },
        data: defined({
          ...dto,
          type: dto.type as Prisma.ParkingSpaceUpdateInput['type'],
          status: dto.status as Prisma.ParkingSpaceUpdateInput['status'],
        }) as Prisma.ParkingSpaceUncheckedUpdateInput,
      })
      .catch((e) => rethrowPrisma(e, { unique: `Bay ${dto.code} already exists.` }));
    const changes = diff(before, after);
    changes.keys = changes.keys.filter((k) => k !== 'updatedAt');
    if (changes.keys.length) {
      await this.audit.record({ actorId: actorOf(req).id, action: 'parking.update', entity: 'parking', entityId: id, target: after.code, summary: `Updated bay ${after.code}: ${changes.keys.join(', ')}`, before: changes.before, after: changes.after, req });
      await this.sync.changed('inventory');
    }
    return after;
  }

  @Delete(':id')
  @RequirePermission('parking.edit')
  async remove(@Param('id') id: string, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const row = await this.prisma.client.parkingSpace.findFirst({ where: { id, developmentId } });
    if (!row) throw new NotFoundException('No such parking bay');
    if (row.status === 'SOLD') throw new BadRequestException(`Bay ${row.code} is sold. Mark it unavailable instead.`);
    await this.prisma.client.parkingSpace.delete({ where: { id } });
    await this.audit.record({ actorId: actorOf(req).id, action: 'parking.delete', entity: 'parking', entityId: id, target: row.code, summary: `Deleted bay ${row.code}`, before: row, req });
    await this.sync.changed('inventory');
    return { ok: true };
  }

  /** §31 — a bay belongs to a residence or resident of this property, and "assigned" means assigned to someone. */
  private async validate(dto: Partial<CreateParkingDto>, developmentId: string) {
    if (dto.unitId) {
      const ok = await this.prisma.client.unit.count({ where: { id: dto.unitId, developmentId } });
      if (!ok) throw new BadRequestException('That residence does not belong to this property.');
    }
    if (dto.residentId) {
      const ok = await this.prisma.client.resident.count({ where: { id: dto.residentId, developmentId } });
      if (!ok) throw new BadRequestException('That resident does not belong to this property.');
    }
    if ((dto.status === 'ASSIGNED' || dto.status === 'SOLD') && !dto.unitId && !dto.residentId) {
      throw new BadRequestException('An assigned or sold bay needs a residence or a resident.');
    }
  }
}
