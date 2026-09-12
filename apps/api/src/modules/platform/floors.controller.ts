import {
  BadRequestException,
  Body,
  ConflictException,
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
import { UNIT_STATUSES } from '@avida/types';
import { AuditService, diff } from '../../common/audit.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { rethrowPrisma } from '../../common/http.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { PrismaService } from '../../common/prisma.service.js';
import { PublicSync } from '../../common/public-sync.service.js';
import { StorageService } from '../../common/storage.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf, defined, requireNonNull } from './actor.js';
import { CreateFloorDto, IdsDto, UpdateFloorDto } from './dto.js';

type Counts = Record<(typeof UNIT_STATUSES)[number], number>;
const zero = (): Counts => Object.fromEntries(UNIT_STATUSES.map((s) => [s, 0])) as Counts;

/** §5 — floors. Counts per floor are derived from its residences, never stored. */
@Controller('admin/floors')
@UseGuards(AdminGuard)
@UseInterceptors(NoStoreInterceptor)
export class FloorsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly sync: PublicSync,
  ) {}

  @Get()
  async list() {
    const developmentId = await this.dev.id();
    const [floors, grouped, covers] = await Promise.all([
      this.prisma.client.floor.findMany({
        where: { building: { developmentId } },
        orderBy: [{ sortOrder: 'desc' }, { level: 'desc' }],
        include: { _count: { select: { media: true } } },
      }),
      this.prisma.client.unit.groupBy({
        by: ['floorId', 'status'],
        where: { developmentId, archivedAt: null },
        _count: true,
      }),
      this.prisma.client.media.findMany({ where: { developmentId, floorId: { not: null }, isCover: true } }),
    ]);
    return floors.map((f) => {
      const counts = zero();
      for (const g of grouped) if (g.floorId === f.id) counts[g.status] = g._count;
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      const cover = covers.find((c) => c.floorId === f.id);
      return { ...f, mediaCount: f._count.media, cover: cover ? this.storage.present(cover) : null, stats: { total, ...counts } };
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const developmentId = await this.dev.id();
    const floor = await this.prisma.client.floor.findFirst({
      where: { id, building: { developmentId } },
      include: {
        units: {
          where: { archivedAt: null },
          orderBy: { positionIndex: 'asc' },
          include: { typology: { select: { id: true, name: true, isPenthouse: true } }, media: { where: { isCover: true }, take: 1 } },
        },
        media: { orderBy: [{ collection: 'asc' }, { sortOrder: 'asc' }] },
      },
    });
    if (!floor) throw new NotFoundException('No such floor');
    const counts = zero();
    for (const u of floor.units) counts[u.status]++;
    return {
      ...floor,
      units: floor.units.map(({ media, ...u }) => ({ ...u, cover: media[0] ? this.storage.present(media[0]) : null })),
      media: floor.media.map((m) => this.storage.present(m)),
      stats: { total: floor.units.length, ...counts },
    };
  }

  @Post()
  @RequirePermission('floor.edit')
  async create(@Body() dto: CreateFloorDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const building = await this.prisma.client.building.findFirst({ where: { developmentId }, orderBy: { name: 'asc' } });
    if (!building) throw new BadRequestException('This property has no building yet.');
    const floor = await this.prisma.client.floor
      .create({
        data: {
          buildingId: building.id,
          level: dto.level,
          label: dto.label,
          displayName: dto.displayName ?? null,
          description: dto.description ?? null,
          heightM: dto.heightM ?? (dto.level + 1) * 3.2,
          published: dto.published ?? true,
          sortOrder: dto.level,
        },
      })
      .catch((e) => rethrowPrisma(e, { unique: `There is already a floor at level ${dto.level}.` }));
    await this.audit.record({ actorId: actorOf(req).id, action: 'floor.create', entity: 'floor', entityId: floor.id, target: floor.label, summary: `Created ${floor.label}`, after: floor, req });
    await this.sync.changed('inventory');
    return floor;
  }

  @Patch(':id')
  @RequirePermission('floor.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateFloorDto, @Req() req: AdminRequest) {
    requireNonNull(dto, ['level', 'label', 'heightM', 'published']);
    const before = await this.owned(id);
    const after = await this.prisma.client.floor
      .update({ where: { id }, data: defined({ ...dto }) })
      .catch((e) => rethrowPrisma(e, { unique: `There is already a floor at level ${dto.level}.` }));
    const changes = diff(before, after);
    changes.keys = changes.keys.filter((k) => k !== 'updatedAt');
    if (changes.keys.length) {
      await this.audit.record({ actorId: actorOf(req).id, action: 'floor.update', entity: 'floor', entityId: id, target: after.label, summary: `Updated ${after.label}: ${changes.keys.join(', ')}`, before: changes.before, after: changes.after, req });
      await this.sync.changed('inventory');
    }
    return after;
  }

  /** Order on the building drawing and in lists (top first). */
  @Post('reorder')
  @RequirePermission('floor.edit')
  async reorder(@Body() dto: IdsDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const owned = await this.prisma.client.floor.count({ where: { id: { in: dto.ids }, building: { developmentId } } });
    if (owned !== dto.ids.length) throw new BadRequestException('Some floors do not belong to this property.');
    // Listed top first, so the first id gets the highest sort order.
    await this.prisma.client.$transaction(
      dto.ids.map((id, i) => this.prisma.client.floor.update({ where: { id }, data: { sortOrder: dto.ids.length - i } })),
    );
    await this.audit.record({ actorId: actorOf(req).id, action: 'floor.reorder', entity: 'floor', summary: 'Reordered floors', rowCount: dto.ids.length, req });
    await this.sync.changed('inventory');
    return { ok: true };
  }

  /**
   * §31 — a floor holding residences is never deleted with them. The caller
   * either moves them first or names a floor to receive them (`reassignTo`);
   * the move and the delete happen in one transaction.
   */
  @Delete(':id')
  @RequirePermission('floor.edit')
  async remove(@Param('id') id: string, @Query('reassignTo') reassignTo: string | undefined, @Req() req: AdminRequest) {
    const floor = await this.owned(id);
    const units = await this.prisma.client.unit.findMany({ where: { floorId: id }, select: { id: true, code: true } });

    if (units.length > 0 && !reassignTo) {
      throw new ConflictException(
        `${floor.label} has ${units.length} residence${units.length === 1 ? '' : 's'} (${units.map((u) => u.code).join(', ')}). Move them to another floor first.`,
      );
    }
    if (reassignTo) {
      if (reassignTo === id) throw new BadRequestException('Choose a different floor to move the residences to.');
      await this.owned(reassignTo);
    }

    await this.prisma.client.$transaction(async (tx) => {
      if (reassignTo && units.length) {
        const max = await tx.unit.aggregate({ where: { floorId: reassignTo }, _max: { positionIndex: true } });
        let next = (max._max.positionIndex ?? -1) + 1;
        for (const u of units) {
          await tx.unit.update({ where: { id: u.id }, data: { floorId: reassignTo, positionIndex: next++ } }).catch((e) =>
            rethrowPrisma(e, { unique: `The receiving floor already has a residence coded ${u.code}.` }),
          );
        }
      }
      // Keep the floor's images in the library rather than deleting them.
      await tx.media.updateMany({ where: { floorId: id }, data: { floorId: null, isCover: false } });
      await tx.floor.delete({ where: { id } });
    });

    await this.audit.record({
      actorId: actorOf(req).id,
      action: 'floor.delete',
      entity: 'floor',
      entityId: id,
      target: floor.label,
      summary: units.length ? `Deleted ${floor.label}; moved ${units.length} residences` : `Deleted ${floor.label}`,
      before: floor,
      req,
    });
    await this.sync.changed('inventory');
    return { ok: true, moved: units.length };
  }

  private async owned(id: string) {
    const developmentId = await this.dev.id();
    const floor = await this.prisma.client.floor.findFirst({ where: { id, building: { developmentId } } });
    if (!floor) throw new NotFoundException('No such floor');
    return floor;
  }
}
