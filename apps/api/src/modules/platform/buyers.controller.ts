import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
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
import { humanise } from '@avida/types';
import { AuditService, diff } from '../../common/audit.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { boolOrUndefined, pageOf, paged } from '../../common/http.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { PrismaService } from '../../common/prisma.service.js';
import { PublicSync } from '../../common/public-sync.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf, defined, requireNonNull } from './actor.js';
import { BuyerUnitDto, CreateBuyerDto, UpdateBuyerDto } from './dto.js';

/** §13 — buyers and clients, prospect to owner. PRIVATE (`buyer.view`). */
@Controller('admin/buyers')
@UseGuards(AdminGuard)
@RequirePermission('buyer.view')
@UseInterceptors(NoStoreInterceptor)
export class BuyersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly audit: AuditService,
    private readonly sync: PublicSync,
  ) {}

  @Get()
  async list(
    @Query('q') q?: string,
    @Query('stage') stage?: string,
    @Query('assignedToId') assignedToId?: string,
    @Query('archived') archived?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const developmentId = await this.dev.id();
    const p = pageOf(page, pageSize);
    const where: Prisma.BuyerWhereInput = {
      developmentId,
      archivedAt: boolOrUndefined(archived) ? { not: null } : null,
      ...(stage ? { stage: stage as Prisma.BuyerWhereInput['stage'] } : {}),
      ...(assignedToId ? { assignedToId } : {}),
      ...(q
        ? { OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] }
        : {}),
    };
    const [rows, total, stages] = await Promise.all([
      this.prisma.client.buyer.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        include: {
          units: { select: { id: true, code: true, status: true } },
          interests: { select: { unit: { select: { id: true, code: true } } } },
          assignedTo: { select: { id: true, name: true } },
          _count: { select: { enquiries: true } },
        },
        skip: p.skip,
        take: p.take,
      }),
      this.prisma.client.buyer.count({ where }),
      this.prisma.client.buyer.groupBy({ by: ['stage'], where: { developmentId, archivedAt: null }, _count: true }),
    ]);
    return {
      ...paged(
        rows.map(({ interests, _count, ...b }) => ({ ...b, interests: interests.map((i) => i.unit), enquiryCount: _count.enquiries })),
        total,
        p,
      ),
      stages: Object.fromEntries(stages.map((s) => [s.stage, s._count])),
    };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    await this.owned(id);
    const [buyer, activity] = await Promise.all([
      this.prisma.client.buyer.findUniqueOrThrow({
        where: { id },
        include: {
          units: { select: { id: true, code: true, status: true, priceMinor: true, currency: true, floor: { select: { label: true } } } },
          interests: { include: { unit: { select: { id: true, code: true, status: true, priceMinor: true, currency: true } } } },
          enquiries: { orderBy: { createdAt: 'desc' }, select: { id: true, status: true, intent: true, message: true, createdAt: true, source: true } },
          residents: { select: { id: true, fullName: true, occupancyStatus: true } },
          assignedTo: { select: { id: true, name: true } },
        },
      }),
      this.prisma.client.adminAuditLog.findMany({
        where: { entity: 'buyer', entityId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { actor: { select: { name: true } } },
      }),
    ]);
    return { ...buyer, interests: buyer.interests.map((i) => i.unit), activity: activity.map(({ actor, ...a }) => ({ ...a, actorName: actor.name })) };
  }

  @Post()
  @RequirePermission('buyer.edit')
  async create(@Body() dto: CreateBuyerDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    if (dto.assignedToId) await this.assertUser(dto.assignedToId);
    const buyer = await this.prisma.client.buyer.create({
      data: {
        developmentId,
        fullName: dto.fullName,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        countryIso: dto.countryIso?.toUpperCase() ?? null,
        stage: (dto.stage ?? 'PROSPECT') as Prisma.BuyerCreateInput['stage'],
        source: dto.source ?? null,
        assignedToId: dto.assignedToId ?? null,
        notes: dto.notes ?? null,
      },
    });
    await this.audit.record({ actorId: actorOf(req).id, action: 'buyer.create', entity: 'buyer', entityId: buyer.id, target: buyer.fullName, summary: `Added client ${buyer.fullName} (${humanise(buyer.stage)})`, req });
    return buyer;
  }

  @Patch(':id')
  @RequirePermission('buyer.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateBuyerDto, @Req() req: AdminRequest) {
    requireNonNull(dto, ['fullName', 'stage']);
    const before = await this.owned(id);
    if (dto.assignedToId) await this.assertUser(dto.assignedToId);
    const after = await this.prisma.client.buyer.update({
      where: { id },
      data: defined({
        ...dto,
        countryIso: dto.countryIso === undefined ? undefined : (dto.countryIso?.toUpperCase() ?? null),
        stage: dto.stage as Prisma.BuyerUpdateInput['stage'],
      }) as Prisma.BuyerUncheckedUpdateInput,
    });
    const changes = diff(before, after);
    changes.keys = changes.keys.filter((k) => k !== 'updatedAt');
    if (changes.keys.length) {
      const stageMoved = changes.keys.includes('stage');
      await this.audit.record({
        actorId: actorOf(req).id,
        action: stageMoved ? 'buyer.stage' : 'buyer.update',
        entity: 'buyer',
        entityId: id,
        target: after.fullName,
        summary: stageMoved ? `${after.fullName}: ${humanise(before.stage)} → ${humanise(after.stage)}` : `Updated client ${after.fullName}: ${changes.keys.join(', ')}`,
        before: stageMoved ? { stage: before.stage } : undefined,
        after: stageMoved ? { stage: after.stage } : undefined,
        req,
      });
    }
    return after;
  }

  /** Records interest in a residence, or the purchase of it. */
  @Post(':id/units')
  @HttpCode(200)
  @RequirePermission('buyer.edit')
  async linkUnit(@Param('id') id: string, @Body() dto: BuyerUnitDto, @Req() req: AdminRequest) {
    const buyer = await this.owned(id);
    const unit = await this.prisma.client.unit.findFirst({ where: { id: dto.unitId, developmentId: buyer.developmentId } });
    if (!unit) throw new BadRequestException('That residence does not belong to this property.');
    if (dto.relation === 'interest') {
      await this.prisma.client.buyerInterest.upsert({
        where: { buyerId_unitId: { buyerId: id, unitId: unit.id } },
        create: { buyerId: id, unitId: unit.id },
        update: {},
      });
    } else {
      if (unit.buyerId && unit.buyerId !== id) throw new ConflictException(`${unit.code} already has a buyer. Remove them first.`);
      await this.prisma.client.unit.update({ where: { id: unit.id }, data: { buyerId: id } });
    }
    await this.audit.record({
      actorId: actorOf(req).id,
      action: dto.relation === 'interest' ? 'buyer.interest' : 'buyer.purchase',
      entity: 'buyer',
      entityId: id,
      target: buyer.fullName,
      summary: dto.relation === 'interest' ? `${buyer.fullName} interested in ${unit.code}` : `${buyer.fullName} assigned as buyer of ${unit.code}`,
      req,
    });
    return { ok: true };
  }

  @Delete(':id/units/:unitId')
  @RequirePermission('buyer.edit')
  async unlinkUnit(@Param('id') id: string, @Param('unitId') unitId: string, @Query('relation') relation: string, @Req() req: AdminRequest) {
    const buyer = await this.owned(id);
    const unit = await this.prisma.client.unit.findFirst({ where: { id: unitId, developmentId: buyer.developmentId }, select: { id: true, code: true, buyerId: true } });
    if (!unit) throw new NotFoundException('No such residence');
    if (relation === 'purchase') {
      if (unit.buyerId === id) await this.prisma.client.unit.update({ where: { id: unitId }, data: { buyerId: null } });
    } else {
      await this.prisma.client.buyerInterest.deleteMany({ where: { buyerId: id, unitId } });
    }
    await this.audit.record({ actorId: actorOf(req).id, action: 'buyer.unlink', entity: 'buyer', entityId: id, target: buyer.fullName, summary: `Removed ${buyer.fullName} from ${unit.code} (${relation === 'purchase' ? 'buyer' : 'interest'})`, req });
    return { ok: true };
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermission('buyer.edit')
  async archive(@Param('id') id: string, @Req() req: AdminRequest) {
    const buyer = await this.owned(id);
    const after = await this.prisma.client.buyer.update({ where: { id }, data: { archivedAt: new Date() } });
    await this.audit.record({ actorId: actorOf(req).id, action: 'buyer.archive', entity: 'buyer', entityId: id, target: buyer.fullName, summary: `Archived client ${buyer.fullName}`, req });
    await this.sync.changed('inventory');
    return after;
  }

  @Post(':id/restore')
  @HttpCode(200)
  @RequirePermission('buyer.edit')
  async restore(@Param('id') id: string, @Req() req: AdminRequest) {
    const buyer = await this.owned(id);
    const after = await this.prisma.client.buyer.update({ where: { id }, data: { archivedAt: null } });
    await this.audit.record({ actorId: actorOf(req).id, action: 'buyer.restore', entity: 'buyer', entityId: id, target: buyer.fullName, summary: `Restored client ${buyer.fullName}`, req });
    return after;
  }

  private async assertUser(id: string) {
    const ok = await this.prisma.client.adminUser.count({ where: { id, active: true } });
    if (!ok) throw new BadRequestException('That team member does not exist or is inactive.');
  }

  private async owned(id: string) {
    const developmentId = await this.dev.id();
    const row = await this.prisma.client.buyer.findFirst({ where: { id, developmentId } });
    if (!row) throw new NotFoundException('No such client');
    return row;
  }
}
