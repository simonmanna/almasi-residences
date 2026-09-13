import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuditService, diff } from '../../common/audit.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { rethrowPrisma } from '../../common/http.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { PrismaService } from '../../common/prisma.service.js';
import { PublicSync } from '../../common/public-sync.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf, defined, requireNonNull } from './actor.js';
import { CreateFeatureDto, CreateTypologyDto, IdsDto, UpdateFeatureDto, UpdateTypologyDto } from './dto.js';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');

/** §8 — residence types are data, not a list in code. */
@Controller('admin/types')
@UseGuards(AdminGuard)
@UseInterceptors(NoStoreInterceptor)
export class TypesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly audit: AuditService,
    private readonly sync: PublicSync,
  ) {}

  @Get()
  @RequirePermission('typology.view')
  async list() {
    const developmentId = await this.dev.id();
    const types = await this.prisma.client.typology.findMany({
      where: { developmentId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { units: { where: { archivedAt: null }, select: { status: true, areaSqm: true, priceMinor: true } } },
    });
    return types.map(({ units, ...t }) => ({
      ...t,
      stats: {
        total: units.length,
        available: units.filter((u) => u.status === 'AVAILABLE').length,
        areaMin: units.length ? Math.min(...units.map((u) => u.areaSqm)) : null,
        areaMax: units.length ? Math.max(...units.map((u) => u.areaSqm)) : null,
      },
    }));
  }

  @Post()
  @RequirePermission('typology.edit')
  async create(@Body() dto: CreateTypologyDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const max = await this.prisma.client.typology.aggregate({ where: { developmentId }, _max: { sortOrder: true } });
    const row = await this.prisma.client.typology
      .create({
        data: {
          developmentId,
          name: dto.name,
          slug: dto.slug ?? slugify(dto.name),
          bedrooms: dto.bedrooms,
          bathrooms: dto.bathrooms,
          areaSqmMin: dto.areaSqmMin ?? 0,
          areaSqmMax: dto.areaSqmMax ?? dto.areaSqmMin ?? 0,
          descriptionMd: dto.descriptionMd ?? null,
          summary: dto.summary ?? null,
          isPenthouse: dto.isPenthouse ?? false,
          published: dto.published ?? true,
          sortOrder: (max._max.sortOrder ?? 0) + 1,
        },
      })
      .catch((e) => rethrowPrisma(e, { unique: 'A residence type with that name already exists.' }));
    await this.audit.record({ actorId: actorOf(req).id, action: 'type.create', entity: 'type', entityId: row.id, target: row.name, summary: `Created type ${row.name}`, after: row, req });
    await this.sync.changed('inventory');
    return row;
  }

  @Patch(':id')
  @RequirePermission('typology.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateTypologyDto, @Req() req: AdminRequest) {
    requireNonNull(dto, ['name', 'slug', 'bedrooms', 'bathrooms', 'areaSqmMin', 'areaSqmMax', 'isPenthouse', 'published']);
    const before = await this.owned(id);
    const after = await this.prisma.client.typology
      .update({ where: { id }, data: defined({ ...dto }) })
      .catch((e) => rethrowPrisma(e, { unique: 'Another residence type already uses that slug.' }));
    const changes = diff(before, after);
    if (changes.keys.length) {
      await this.audit.record({ actorId: actorOf(req).id, action: 'type.update', entity: 'type', entityId: id, target: after.name, summary: `Updated type ${after.name}: ${changes.keys.join(', ')}`, before: changes.before, after: changes.after, req });
      await this.sync.changed('inventory');
    }
    return after;
  }

  @Post('reorder')
  @RequirePermission('typology.edit')
  async reorder(@Body() dto: IdsDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    await this.prisma.client.$transaction(
      dto.ids.map((id, i) => this.prisma.client.typology.updateMany({ where: { id, developmentId }, data: { sortOrder: i } })),
    );
    await this.audit.record({ actorId: actorOf(req).id, action: 'type.reorder', entity: 'type', summary: `Reordered ${dto.ids.length} residence types`, rowCount: dto.ids.length, req });
    await this.sync.changed('inventory');
    return { ok: true };
  }

  @Delete(':id')
  @RequirePermission('typology.edit')
  async remove(@Param('id') id: string, @Req() req: AdminRequest) {
    const type = await this.owned(id);
    const used = await this.prisma.client.unit.count({ where: { typologyId: id } });
    if (used) throw new ConflictException(`${used} residence${used === 1 ? ' uses' : 's use'} “${type.name}”. Change their type first.`);
    await this.prisma.client.typology.delete({ where: { id } }).catch((e) => rethrowPrisma(e, { restrict: 'Tours or media still use this type.' }));
    await this.audit.record({ actorId: actorOf(req).id, action: 'type.delete', entity: 'type', entityId: id, target: type.name, summary: `Deleted type ${type.name}`, before: type, req });
    await this.sync.changed('inventory');
    return { ok: true };
  }

  private async owned(id: string) {
    const developmentId = await this.dev.id();
    const row = await this.prisma.client.typology.findFirst({ where: { id, developmentId } });
    if (!row) throw new NotFoundException('No such residence type');
    return row;
  }
}

/** The feature catalogue residences pick from. */
@Controller('admin/features')
@UseGuards(AdminGuard)
@UseInterceptors(NoStoreInterceptor)
export class FeaturesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly audit: AuditService,
    private readonly sync: PublicSync,
  ) {}

  @Get()
  @RequirePermission('typology.view')
  async list() {
    const developmentId = await this.dev.id();
    const rows = await this.prisma.client.feature.findMany({
      where: { developmentId },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
      include: { _count: { select: { units: true } } },
    });
    return rows.map(({ _count, ...f }) => ({ ...f, residences: _count.units }));
  }

  @Post()
  @RequirePermission('typology.edit')
  async create(@Body() dto: CreateFeatureDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    const row = await this.prisma.client.feature
      .create({ data: { developmentId, name: dto.name, category: dto.category ?? 'General', iconKey: dto.iconKey ?? null } })
      .catch((e) => rethrowPrisma(e, { unique: 'That feature already exists.' }));
    await this.audit.record({ actorId: actorOf(req).id, action: 'feature.create', entity: 'feature', entityId: row.id, target: row.name, summary: `Created feature ${row.name}`, req });
    await this.sync.changed('content');
    return row;
  }

  @Patch(':id')
  @RequirePermission('typology.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateFeatureDto, @Req() req: AdminRequest) {
    requireNonNull(dto, ['name', 'category']);
    await this.owned(id);
    const row = await this.prisma.client.feature
      .update({ where: { id }, data: defined({ ...dto }) })
      .catch((e) => rethrowPrisma(e, { unique: 'That feature already exists.' }));
    await this.audit.record({ actorId: actorOf(req).id, action: 'feature.update', entity: 'feature', entityId: id, target: row.name, summary: `Updated feature ${row.name}`, req });
    await this.sync.changed('inventory');
    return row;
  }

  @Delete(':id')
  @RequirePermission('typology.edit')
  async remove(@Param('id') id: string, @Req() req: AdminRequest) {
    const row = await this.owned(id);
    await this.prisma.client.feature.delete({ where: { id } });
    await this.audit.record({ actorId: actorOf(req).id, action: 'feature.delete', entity: 'feature', entityId: id, target: row.name, summary: `Deleted feature ${row.name}`, req });
    await this.sync.changed('inventory');
    return { ok: true };
  }

  private async owned(id: string) {
    const developmentId = await this.dev.id();
    const row = await this.prisma.client.feature.findFirst({ where: { id, developmentId } });
    if (!row) throw new NotFoundException('No such feature');
    return row;
  }
}
