import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { AuditService } from '../../common/audit.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { PrismaService } from '../../common/prisma.service.js';
import { PublicSync } from '../../common/public-sync.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf } from './actor.js';
import { CreateLandmarkDto, UpdateLandmarkDto } from './dto.js';

/**
 * Website → Location — the places listed and mapped around the site.
 *
 * Distances are computed by PostGIS from the coordinates (§4.5), exactly as
 * the seed does, and drive/walk times are the same modelled estimates (§13).
 * An admin may instead type the figures (manualDistance), and those are kept.
 */
@Controller('admin/landmarks')
@UseGuards(AdminGuard)
@UseInterceptors(NoStoreInterceptor)
export class LandmarksController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly audit: AuditService,
    private readonly sync: PublicSync,
  ) {}

  @Get()
  @RequirePermission('content.view')
  async list() {
    const developmentId = await this.dev.id();
    const [origin, landmarks] = await Promise.all([
      this.prisma.client.development.findUniqueOrThrow({ where: { id: developmentId }, select: { name: true, latitude: true, longitude: true } }),
      this.prisma.client.landmark.findMany({ where: { developmentId }, orderBy: [{ distanceM: 'asc' }, { name: 'asc' }] }),
    ]);
    return { origin, landmarks };
  }

  @Post()
  @RequirePermission('content.edit')
  async create(@Body() dto: CreateLandmarkDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const manual = dto.manualDistance ?? false;
    const row = await this.prisma.client.landmark.create({
      data: {
        developmentId,
        name: dto.name.trim(),
        category: dto.category,
        latitude: dto.latitude,
        longitude: dto.longitude,
        manualDistance: manual,
        visible: dto.visible ?? true,
        ...(manual ? { distanceM: dto.distanceM ?? null, driveMinutes: dto.driveMinutes ?? null, walkMinutes: dto.walkMinutes ?? null } : {}),
      },
    });
    if (!manual) await this.compute(row.id);
    await this.audit.record({ actorId: actorOf(req).id, action: 'landmark.create', entity: 'landmark', entityId: row.id, target: row.name, summary: `Added nearby place ${row.name}`, req });
    await this.sync.changed('content');
    return this.one(row.id);
  }

  @Patch(':id')
  @RequirePermission('content.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateLandmarkDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const before = await this.prisma.client.landmark.findFirst({ where: { id, developmentId } });
    if (!before) throw new NotFoundException('No such place');
    const manual = dto.manualDistance ?? before.manualDistance;
    await this.prisma.client.landmark.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
        ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
        manualDistance: manual,
        ...(dto.visible !== undefined ? { visible: dto.visible } : {}),
        ...(manual
          ? {
              ...(dto.distanceM !== undefined ? { distanceM: dto.distanceM } : {}),
              ...(dto.driveMinutes !== undefined ? { driveMinutes: dto.driveMinutes } : {}),
              ...(dto.walkMinutes !== undefined ? { walkMinutes: dto.walkMinutes } : {}),
            }
          : {}),
      },
    });
    if (!manual) await this.compute(id);
    const row = await this.one(id);
    await this.audit.record({ actorId: actorOf(req).id, action: 'landmark.update', entity: 'landmark', entityId: id, target: row.name, summary: `Edited nearby place ${row.name}`, req });
    await this.sync.changed('content');
    return row;
  }

  @Delete(':id')
  @RequirePermission('content.edit')
  async remove(@Param('id') id: string, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const row = await this.prisma.client.landmark.findFirst({ where: { id, developmentId } });
    if (!row) throw new NotFoundException('No such place');
    await this.prisma.client.landmark.delete({ where: { id } });
    await this.audit.record({ actorId: actorOf(req).id, action: 'landmark.delete', entity: 'landmark', entityId: id, target: row.name, summary: `Removed nearby place ${row.name}`, req });
    await this.sync.changed('content');
    return { ok: true };
  }

  private one(id: string) {
    return this.prisma.client.landmark.findUniqueOrThrow({ where: { id } });
  }

  /** The seed's PostGIS distance, then its 28 km/h drive and 4.5 km/h walk (≤ 3 km) estimates. */
  private async compute(id: string) {
    await this.prisma.client.$executeRaw`
      UPDATE "Landmark" l
      SET "distanceM" = ROUND(
        ST_Distance(
          ST_SetSRID(ST_MakePoint(l."longitude", l."latitude"), 4326)::geography,
          ST_SetSRID(ST_MakePoint(d."longitude", d."latitude"), 4326)::geography
        )
      )::int
      FROM "Development" d
      WHERE l."id" = ${id} AND d."id" = l."developmentId"
    `;
    await this.prisma.client.$executeRaw`
      UPDATE "Landmark"
      SET "driveMinutes" = GREATEST(1, ROUND(("distanceM" / 1000.0) / 28.0 * 60)::int),
          "walkMinutes"  = CASE WHEN "distanceM" <= 3000
                                THEN GREATEST(1, ROUND(("distanceM" / 1000.0) / 4.5 * 60)::int)
                                ELSE NULL END
      WHERE "id" = ${id}
    `;
  }
}
