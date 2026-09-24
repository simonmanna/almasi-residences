import { BadRequestException, Body, Controller, Get, Patch, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Prisma } from '@avida/db';
import { AuditService, diff } from '../../common/audit.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { PrismaService } from '../../common/prisma.service.js';
import { PublicSync } from '../../common/public-sync.service.js';
import { StorageService } from '../../common/storage.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf, defined, requireNonNull, toDate } from './actor.js';
import { UpdatePropertyDto } from './dto.js';

/** §4 — the property itself. One row, every field editable. */
@Controller('admin/property')
@UseGuards(AdminGuard)
@UseInterceptors(NoStoreInterceptor)
export class PropertyController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly sync: PublicSync,
  ) {}

  @Get()
  @RequirePermission('property.view')
  async get() {
    const id = await this.dev.id();
    const dev = await this.prisma.client.development.findUniqueOrThrow({
      where: { id },
      include: {
        logoMedia: true,
        heroMedia: true,
        mainMedia: true,
        videoMedia: true,
        buildings: { select: { id: true, name: true, floorCount: true, _count: { select: { floors: true } } } },
      },
    });
    const [floors, residences] = await Promise.all([
      this.prisma.client.floor.count({ where: { building: { developmentId: id } } }),
      this.prisma.client.unit.count({ where: { developmentId: id, archivedAt: null } }),
    ]);
    const { logoMedia, heroMedia, mainMedia, videoMedia, ...rest } = dev;
    const view = (m: typeof logoMedia) => (m ? this.storage.present(m) : null);
    return {
      ...rest,
      logoMedia: view(logoMedia),
      heroMedia: view(heroMedia),
      mainMedia: view(mainMedia),
      videoMedia: view(videoMedia),
      // §39 — derived, shown beside the form, never an input.
      derived: { floors, residences },
    };
  }

  @Patch()
  @RequirePermission('property.edit')
  async update(@Body() dto: UpdatePropertyDto, @Req() req: AdminRequest) {
    requireNonNull(dto, ['name', 'descriptionMd', 'city', 'country', 'latitude', 'longitude', 'propertyType', 'currency']);
    const id = await this.dev.id();
    const before = await this.prisma.client.development.findUniqueOrThrow({ where: { id } });

    for (const key of ['logoMediaId', 'heroMediaId', 'mainMediaId', 'videoMediaId'] as const) {
      const mediaId = dto[key];
      if (mediaId) {
        const ok = await this.prisma.client.media.count({ where: { id: mediaId, developmentId: id } });
        if (!ok) throw new BadRequestException('That media file does not belong to this property.');
      }
    }

    const data = defined({
      ...dto,
      handoverDate: toDate(dto.handoverDate),
      socials: dto.socials === undefined ? undefined : (dto.socials ?? undefined),
      status: dto.status as Prisma.DevelopmentUpdateInput['status'],
      constructionStatus: dto.constructionStatus as Prisma.DevelopmentUpdateInput['constructionStatus'],
    }) as Prisma.DevelopmentUncheckedUpdateInput;

    const after = await this.prisma.client.development.update({ where: { id }, data });
    this.dev.invalidate();
    // The pin moved: every nearby place measured from it is now off.
    if (after.latitude !== before.latitude || after.longitude !== before.longitude) await this.remeasureLandmarks(id);
    const changes = diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>);
    changes.keys = changes.keys.filter((k) => k !== 'updatedAt');
    if (changes.keys.length) {
      await this.audit.record({
        actorId: actorOf(req).id,
        action: 'property.update',
        entity: 'property',
        entityId: id,
        target: after.name,
        summary: `Updated ${changes.keys.join(', ')}`,
        before: changes.before,
        after: changes.after,
        req,
      });
      await this.sync.changed('all');
    }
    return this.get();
  }

  /** Same PostGIS distance and 28 km/h drive / 4.5 km/h walk estimates as the seed; manual rows are left alone. */
  private async remeasureLandmarks(developmentId: string) {
    await this.prisma.client.$executeRaw`
      UPDATE "Landmark" l
      SET "distanceM" = ROUND(
        ST_Distance(
          ST_SetSRID(ST_MakePoint(l."longitude", l."latitude"), 4326)::geography,
          ST_SetSRID(ST_MakePoint(d."longitude", d."latitude"), 4326)::geography
        )
      )::int
      FROM "Development" d
      WHERE d."id" = ${developmentId} AND l."developmentId" = d."id" AND NOT l."manualDistance"
    `;
    await this.prisma.client.$executeRaw`
      UPDATE "Landmark"
      SET "driveMinutes" = GREATEST(1, ROUND(("distanceM" / 1000.0) / 28.0 * 60)::int),
          "walkMinutes"  = CASE WHEN "distanceM" <= 3000
                                THEN GREATEST(1, ROUND(("distanceM" / 1000.0) / 4.5 * 60)::int)
                                ELSE NULL END
      WHERE "developmentId" = ${developmentId} AND NOT "manualDistance"
    `;
  }
}
