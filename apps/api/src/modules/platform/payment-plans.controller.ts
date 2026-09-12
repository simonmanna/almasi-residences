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
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Prisma } from '@avida/db';
import { assertPercentagesSumTo100 } from '@avida/types';
import { AuditService } from '../../common/audit.service.js';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { NoStoreInterceptor } from '../../common/no-store.interceptor.js';
import { PrismaService } from '../../common/prisma.service.js';
import { PublicSync } from '../../common/public-sync.service.js';
import { AdminGuard, RequirePermission, type AdminRequest } from '../admin/admin.guard.js';
import { actorOf, defined, requireNonNull, toDate } from './actor.js';
import { CreatePaymentPlanDto, MilestoneDto, UpdatePaymentPlanDto } from './dto.js';

/** §10 — payment plans and their milestones. Milestones always sum to 100% (§5.6). */
@Controller('admin/payment-plans')
@UseGuards(AdminGuard)
@UseInterceptors(NoStoreInterceptor)
export class PaymentPlansController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly audit: AuditService,
    private readonly sync: PublicSync,
  ) {}

  @Get()
  async list() {
    const developmentId = await this.dev.id();
    const plans = await this.prisma.client.paymentPlan.findMany({
      where: { developmentId },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: { milestones: { orderBy: { sortOrder: 'asc' } }, _count: { select: { units: true } } },
    });
    const unassigned = await this.prisma.client.unit.count({ where: { developmentId, paymentPlanId: null, archivedAt: null } });
    return plans.map(({ _count, ...p }) => ({
      ...p,
      // Residences with no plan of their own follow the default one.
      residences: _count.units + (p.isDefault ? unassigned : 0),
      totalPercent: Math.round(p.milestones.reduce((a, m) => a + m.percent, 0) * 100) / 100,
    }));
  }

  @Post()
  @RequirePermission('payment-plan.edit')
  async create(@Body() dto: CreatePaymentPlanDto, @Req() req: AdminRequest) {
    const developmentId = await this.dev.id();
    if (dto.milestones) this.assertMilestones(dto.milestones);
    const plan = await this.prisma.client.$transaction(async (tx) => {
      if (dto.isDefault) await tx.paymentPlan.updateMany({ where: { developmentId }, data: { isDefault: false } });
      const hasDefault = await tx.paymentPlan.count({ where: { developmentId, isDefault: true } });
      return tx.paymentPlan.create({
        data: {
          developmentId,
          name: dto.name,
          description: dto.description ?? null,
          isDefault: dto.isDefault ?? hasDefault === 0,
          published: dto.published ?? true,
          depositPercent: dto.depositPercent ?? null,
          reservationFeeMinor: dto.reservationFeeMinor ?? null,
          installmentCount: dto.installmentCount ?? null,
          durationMonths: dto.durationMonths ?? null,
          milestones: dto.milestones ? { create: this.milestoneRows(dto.milestones, developmentId) } : undefined,
        },
        include: { milestones: true },
      });
    });
    await this.audit.record({ actorId: actorOf(req).id, action: 'payment-plan.create', entity: 'payment-plan', entityId: plan.id, target: plan.name, summary: `Created payment plan ${plan.name}`, after: plan, req });
    await this.sync.changed('all');
    return plan;
  }

  @Patch(':id')
  @RequirePermission('payment-plan.edit')
  async update(@Param('id') id: string, @Body() dto: UpdatePaymentPlanDto, @Req() req: AdminRequest) {
    requireNonNull(dto, ['name', 'isDefault', 'published']);
    const before = await this.owned(id);
    if (dto.isDefault === false && before.isDefault) throw new BadRequestException('Make another plan the default instead.');
    if (dto.milestones) this.assertMilestones(dto.milestones);
    const { milestones, ...fields } = dto;
    const plan = await this.prisma.client.$transaction(async (tx) => {
      if (dto.isDefault) await tx.paymentPlan.updateMany({ where: { developmentId: before.developmentId, id: { not: id } }, data: { isDefault: false } });
      if (milestones) {
        await tx.paymentMilestone.deleteMany({ where: { paymentPlanId: id } });
        await tx.paymentMilestone.createMany({ data: this.milestoneRows(milestones, before.developmentId).map((m) => ({ ...m, paymentPlanId: id })) });
      }
      return tx.paymentPlan.update({ where: { id }, data: defined({ ...fields }), include: { milestones: { orderBy: { sortOrder: 'asc' } } } });
    });
    await this.audit.record({
      actorId: actorOf(req).id,
      action: 'payment-plan.update',
      entity: 'payment-plan',
      entityId: id,
      target: plan.name,
      summary: `Updated payment plan ${plan.name}${milestones ? ` (${milestones.length} milestones)` : ''}`,
      before: milestones ? { milestones: before.milestones.map((m) => `${m.label} ${m.percent}%`) } : undefined,
      after: milestones ? { milestones: milestones.map((m) => `${m.label} ${m.percent}%`) } : undefined,
      req,
    });
    await this.sync.changed('all');
    return plan;
  }

  @Delete(':id')
  @RequirePermission('payment-plan.edit')
  async remove(@Param('id') id: string, @Req() req: AdminRequest) {
    const plan = await this.owned(id);
    if (plan.isDefault) throw new ConflictException('The default plan cannot be deleted. Make another plan the default first.');
    const used = await this.prisma.client.unit.count({ where: { paymentPlanId: id } });
    if (used) throw new ConflictException(`${used} residence${used === 1 ? ' is' : 's are'} on this plan. Move them to another plan first.`);
    await this.prisma.client.paymentPlan.delete({ where: { id } });
    await this.audit.record({ actorId: actorOf(req).id, action: 'payment-plan.delete', entity: 'payment-plan', entityId: id, target: plan.name, summary: `Deleted payment plan ${plan.name}`, req });
    await this.sync.changed('all');
    return { ok: true };
  }

  private assertMilestones(milestones: MilestoneDto[]) {
    if (milestones.length === 0) throw new BadRequestException('A plan needs at least one milestone.');
    try {
      assertPercentagesSumTo100(milestones.map((m, i) => ({ id: String(i), sortOrder: i, label: m.label, percent: m.percent, triggerType: m.triggerType as never })));
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const dated = milestones.find((m) => m.triggerType === 'ON_DATE' && !m.triggerDate);
    if (dated) throw new BadRequestException(`“${dated.label}” is due on a date — choose the date.`);
  }

  private milestoneRows(milestones: MilestoneDto[], developmentId: string): Prisma.PaymentMilestoneCreateManyPaymentPlanInput[] {
    return milestones.map((m, i) => ({
      developmentId,
      sortOrder: i + 1,
      label: m.label,
      percent: m.percent,
      triggerType: m.triggerType as Prisma.PaymentMilestoneCreateManyPaymentPlanInput['triggerType'],
      triggerDate: toDate(m.triggerDate) ?? null,
      triggerNote: m.triggerNote ?? null,
    }));
  }

  private async owned(id: string) {
    const developmentId = await this.dev.id();
    const row = await this.prisma.client.paymentPlan.findFirst({ where: { id, developmentId }, include: { milestones: true } });
    if (!row) throw new NotFoundException('No such payment plan');
    return row;
  }
}
