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
import type { Prisma } from '@avida/db';
import { AuditService, diff } from '../../common/audit.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { boolOrUndefined, pageOf, paged } from '../../common/http.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { PrismaService } from '../../common/prisma.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf, defined, requireNonNull, toDate } from './actor.js';
import { AssignResidentDto, CreateResidentDto, UpdateResidentDto } from './dto.js';

/**
 * §12 — residents. PRIVATE: every route needs `resident.view`, and no public
 * endpoint reads this table (§32).
 */
@Controller('admin/residents')
@UseGuards(AdminGuard)
@RequirePermission('resident.view')
@UseInterceptors(NoStoreInterceptor)
export class ResidentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(
    @Query('q') q?: string,
    @Query('occupancy') occupancy?: string,
    @Query('unitId') unitId?: string,
    @Query('archived') archived?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const developmentId = await this.dev.id();
    const p = pageOf(page, pageSize);
    const where: Prisma.ResidentWhereInput = {
      developmentId,
      archivedAt: boolOrUndefined(archived) ? { not: null } : null,
      ...(occupancy ? { occupancyStatus: occupancy as Prisma.ResidentWhereInput['occupancyStatus'] } : {}),
      ...(unitId ? { unitId } : {}),
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q } },
              { unit: { code: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.client.resident.findMany({
        where,
        orderBy: [{ occupancyStatus: 'asc' }, { fullName: 'asc' }],
        include: { unit: { select: { id: true, code: true, floor: { select: { label: true } } } } },
        skip: p.skip,
        take: p.take,
      }),
      this.prisma.client.resident.count({ where }),
    ]);
    return paged(rows, total, p);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const resident = await this.owned(id);
    const [full, activity] = await Promise.all([
      this.prisma.client.resident.findUniqueOrThrow({
        where: { id },
        include: {
          unit: { select: { id: true, code: true, status: true, floor: { select: { label: true } }, typology: { select: { name: true } } } },
          residencies: { orderBy: { startedAt: 'desc' }, include: { unit: { select: { id: true, code: true } } } },
          parkingSpaces: true,
          buyer: { select: { id: true, fullName: true, stage: true } },
        },
      }),
      this.prisma.client.adminAuditLog.findMany({
        where: { entity: 'resident', entityId: resident.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { actor: { select: { name: true } } },
      }),
    ]);
    return { ...full, activity: activity.map(({ actor, ...a }) => ({ ...a, actorName: actor.name })) };
  }

  @Post()
  @RequirePermission('resident.edit')
  async create(@Body() dto: CreateResidentDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const actor = actorOf(req);
    if (dto.unitId) await this.assignable(dto.unitId, developmentId);
    if (dto.buyerId) await this.ownedBuyer(dto.buyerId, developmentId);
    const resident = await this.prisma.client.resident.create({
      data: {
        developmentId,
        fullName: dto.fullName,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        countryIso: dto.countryIso?.toUpperCase() ?? null,
        residentType: (dto.residentType ?? 'OWNER') as Prisma.ResidentCreateInput['residentType'],
        occupancyStatus: (dto.occupancyStatus ?? (dto.unitId ? 'ACTIVE' : 'UPCOMING')) as Prisma.ResidentCreateInput['occupancyStatus'],
        moveInDate: toDate(dto.moveInDate) ?? null,
        moveOutDate: toDate(dto.moveOutDate) ?? null,
        notes: dto.notes ?? null,
        buyerId: dto.buyerId ?? null,
        unitId: dto.unitId ?? null,
        residencies: dto.unitId ? { create: { unitId: dto.unitId, startedAt: toDate(dto.moveInDate) ?? new Date(), actor: actor.id } } : undefined,
      },
    });
    await this.audit.record({ actorId: actor.id, action: 'resident.create', entity: 'resident', entityId: resident.id, target: resident.fullName, summary: `Added resident ${resident.fullName}`, req });
    return resident;
  }

  @Patch(':id')
  @RequirePermission('resident.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateResidentDto, @Req() req: AdminRequest) {
    requireNonNull(dto, ['fullName', 'residentType', 'occupancyStatus']);
    const before = await this.owned(id);
    if (dto.buyerId) await this.ownedBuyer(dto.buyerId, before.developmentId);
    const after = await this.prisma.client.resident.update({
      where: { id },
      data: defined({
        ...dto,
        countryIso: dto.countryIso === undefined ? undefined : (dto.countryIso?.toUpperCase() ?? null),
        moveInDate: toDate(dto.moveInDate),
        moveOutDate: toDate(dto.moveOutDate),
        residentType: dto.residentType as Prisma.ResidentUpdateInput['residentType'],
        occupancyStatus: dto.occupancyStatus as Prisma.ResidentUpdateInput['occupancyStatus'],
      }) as Prisma.ResidentUncheckedUpdateInput,
    });
    const changes = diff(before, after);
    changes.keys = changes.keys.filter((k) => k !== 'updatedAt');
    if (changes.keys.length) {
      // The audit row names the fields, never their private values.
      await this.audit.record({ actorId: actorOf(req).id, action: 'resident.update', entity: 'resident', entityId: id, target: after.fullName, summary: `Updated resident ${after.fullName}: ${changes.keys.join(', ')}`, req });
    }
    return after;
  }

  /**
   * Moves a resident into a residence (or out, with `unitId: null`). The
   * previous stay is closed, a new one opened, and the residence's occupancy
   * follows — a sold home someone lives in reads "occupied".
   */
  @Post(':id/assign')
  @HttpCode(200)
  @RequirePermission('resident.edit')
  async assign(@Param('id') id: string, @Body() dto: AssignResidentDto, @Req() req: AdminRequest) {
    const resident = await this.owned(id);
    const actor = actorOf(req);
    const previous = resident.unitId;
    const target = dto.unitId ?? null;
    if (target === previous) return resident;
    if (target) await this.assignable(target, resident.developmentId);
    const at = toDate(dto.moveInDate) ?? new Date();

    const after = await this.prisma.client.$transaction(async (tx) => {
      await tx.residency.updateMany({ where: { residentId: id, endedAt: null }, data: { endedAt: at } });
      if (target) await tx.residency.create({ data: { residentId: id, unitId: target, startedAt: at, actor: actor.id } });
      return tx.resident.update({
        where: { id },
        data: {
          unitId: target,
          occupancyStatus: target ? 'ACTIVE' : 'MOVED_OUT',
          moveInDate: target ? at : resident.moveInDate,
          moveOutDate: target ? null : at,
        },
        include: { unit: { select: { code: true } } },
      });
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'resident.assign',
      entity: 'resident',
      entityId: id,
      target: after.fullName,
      summary: target ? `${after.fullName} moved into ${after.unit!.code}` : `${after.fullName} moved out`,
      req,
    });
    return after;
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermission('resident.edit')
  async archive(@Param('id') id: string, @Req() req: AdminRequest) {
    const resident = await this.owned(id);
    const actor = actorOf(req);
    const after = await this.prisma.client.$transaction(async (tx) => {
      await tx.residency.updateMany({ where: { residentId: id, endedAt: null }, data: { endedAt: new Date() } });
      return tx.resident.update({ where: { id }, data: { archivedAt: new Date(), unitId: null, occupancyStatus: 'MOVED_OUT' } });
    });
    await this.audit.record({ actorId: actor.id, action: 'resident.archive', entity: 'resident', entityId: id, target: resident.fullName, summary: `Archived resident ${resident.fullName}`, req });
    return after;
  }

  @Post(':id/restore')
  @HttpCode(200)
  @RequirePermission('resident.edit')
  async restore(@Param('id') id: string, @Req() req: AdminRequest) {
    const resident = await this.owned(id);
    const after = await this.prisma.client.resident.update({ where: { id }, data: { archivedAt: null } });
    await this.audit.record({ actorId: actorOf(req).id, action: 'resident.restore', entity: 'resident', entityId: id, target: resident.fullName, summary: `Restored resident ${resident.fullName}`, req });
    return after;
  }

  /** §31 — someone can only live in a home that has been sold. */
  private async assignable(unitId: string, developmentId: string) {
    const unit = await this.prisma.client.unit.findFirst({ where: { id: unitId, developmentId }, select: { code: true, status: true, archivedAt: true } });
    if (!unit) throw new BadRequestException('That residence does not belong to this property.');
    if (unit.archivedAt) throw new BadRequestException(`${unit.code} is archived.`);
    if (unit.status !== 'SOLD') {
      throw new BadRequestException(`${unit.code} is not sold yet. Mark it sold before assigning a resident.`);
    }
  }

  private async ownedBuyer(id: string, developmentId: string) {
    const ok = await this.prisma.client.buyer.count({ where: { id, developmentId } });
    if (!ok) throw new BadRequestException('That buyer does not belong to this property.');
  }

  private async owned(id: string) {
    const developmentId = await this.dev.id();
    const row = await this.prisma.client.resident.findFirst({ where: { id, developmentId } });
    if (!row) throw new NotFoundException('No such resident');
    return row;
  }
}
