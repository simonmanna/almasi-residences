import {
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
import { AuditService } from '../../common/audit.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { PrismaService } from '../../common/prisma.service.js';
import { PublicSync } from '../../common/public-sync.service.js';
import { StorageService } from '../../common/storage.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf, defined, requireNonNull } from './actor.js';
import { CreateRoomDto, IdsDto, UpdateRoomDto } from './dto.js';

/** §47 — rooms and spaces inside a residence. */
@Controller('admin')
@UseGuards(AdminGuard)
@UseInterceptors(NoStoreInterceptor)
export class RoomsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly sync: PublicSync,
  ) {}

  /** Every room in the property — the "Rooms / Spaces" screen. */
  @Get('rooms')
  @RequirePermission('residence.view')
  async all(@Query('type') type?: string, @Query('q') q?: string) {
    const developmentId = await this.dev.id();
    const rows = await this.prisma.client.room.findMany({
      where: {
        unit: { developmentId, archivedAt: null },
        ...(type ? { type: type as Prisma.RoomWhereInput['type'] } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { unit: { code: { contains: q, mode: 'insensitive' } } }] } : {}),
      },
      orderBy: [{ unit: { code: 'asc' } }, { sortOrder: 'asc' }],
      include: { unit: { select: { id: true, code: true, floor: { select: { label: true } } } }, _count: { select: { media: true } } },
      take: 1000,
    });
    return rows.map(({ _count, ...r }) => ({ ...r, mediaCount: _count.media }));
  }

  @Get('residences/:unitId/rooms')
  @RequirePermission('residence.view')
  async list(@Param('unitId') unitId: string) {
    await this.ownedUnit(unitId);
    const rows = await this.prisma.client.room.findMany({
      where: { unitId },
      orderBy: { sortOrder: 'asc' },
      include: { media: { orderBy: { sortOrder: 'asc' } } },
    });
    return rows.map((r) => ({ ...r, media: r.media.map((m) => this.storage.present(m)) }));
  }

  @Post('residences/:unitId/rooms')
  @RequirePermission('room.edit')
  async create(@Param('unitId') unitId: string, @Body() dto: CreateRoomDto, @Req() req: AdminRequest) {
    const unit = await this.ownedUnit(unitId);
    const max = await this.prisma.client.room.aggregate({ where: { unitId }, _max: { sortOrder: true } });
    const room = await this.prisma.client.room.create({
      data: {
        unitId,
        name: dto.name,
        type: dto.type as Prisma.RoomCreateInput['type'],
        areaSqm: dto.areaSqm ?? null,
        description: dto.description ?? null,
        features: dto.features ?? [],
        planX: dto.planX ?? null,
        planY: dto.planY ?? null,
        planW: dto.planW ?? null,
        planH: dto.planH ?? null,
        planOpen: dto.planOpen ?? (dto.type === 'BALCONY' || dto.type === 'TERRACE'),
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
    });
    await this.audit.record({ actorId: actorOf(req).id, action: 'room.create', entity: 'residence', entityId: unitId, target: unit.code, summary: `Added ${room.name} to ${unit.code}`, req });
    await this.sync.changed('inventory');
    return room;
  }

  @Post('residences/:unitId/rooms/reorder')
  @RequirePermission('room.edit')
  async reorder(@Param('unitId') unitId: string, @Body() dto: IdsDto, @Req() req: AdminRequest) {
    const unit = await this.ownedUnit(unitId);
    await this.prisma.client.$transaction(
      dto.ids.map((id, i) => this.prisma.client.room.updateMany({ where: { id, unitId }, data: { sortOrder: i } })),
    );
    await this.audit.record({ actorId: actorOf(req).id, action: 'room.reorder', entity: 'residence', entityId: unitId, target: unit.code, summary: `Reordered ${dto.ids.length} rooms in ${unit.code}`, rowCount: dto.ids.length, req });
    await this.sync.changed('inventory');
    return { ok: true };
  }

  @Patch('rooms/:id')
  @RequirePermission('room.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateRoomDto, @Req() req: AdminRequest) {
    requireNonNull(dto, ['name', 'type', 'features']);
    const room = await this.ownedRoom(id);
    const next = await this.prisma.client.room.update({
      where: { id },
      data: defined({ ...dto, type: dto.type as Prisma.RoomUpdateInput['type'] }),
    });
    await this.audit.record({ actorId: actorOf(req).id, action: 'room.update', entity: 'residence', entityId: room.unitId, target: room.unit.code, summary: `Updated ${next.name} in ${room.unit.code}`, req });
    await this.sync.changed('inventory');
    return next;
  }

  @Delete('rooms/:id')
  @RequirePermission('room.edit')
  async remove(@Param('id') id: string, @Req() req: AdminRequest) {
    const room = await this.ownedRoom(id);
    await this.prisma.client.$transaction([
      // The room's photographs stay with the residence.
      this.prisma.client.media.updateMany({ where: { roomId: id }, data: { roomId: null } }),
      this.prisma.client.room.delete({ where: { id } }),
    ]);
    await this.audit.record({ actorId: actorOf(req).id, action: 'room.delete', entity: 'residence', entityId: room.unitId, target: room.unit.code, summary: `Removed ${room.name} from ${room.unit.code}`, req });
    await this.sync.changed('inventory');
    return { ok: true };
  }

  private async ownedUnit(id: string) {
    const developmentId = await this.dev.id();
    const unit = await this.prisma.client.unit.findFirst({ where: { id, developmentId }, select: { id: true, code: true } });
    if (!unit) throw new NotFoundException('No such residence');
    return unit;
  }

  private async ownedRoom(id: string) {
    const developmentId = await this.dev.id();
    const room = await this.prisma.client.room.findFirst({ where: { id, unit: { developmentId } }, include: { unit: { select: { code: true } } } });
    if (!room) throw new NotFoundException('No such room');
    return room;
  }
}
