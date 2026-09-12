import { Injectable, NotFoundException } from '@nestjs/common';
import { computeSchedule, effectivePriceMinor } from '@avida/types';
import { PrismaService } from '../../common/prisma.service.js';

const milestoneSelect = { milestones: { orderBy: { sortOrder: 'asc' as const } } };

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * §5.6 — the API resolves the data; the arithmetic lives in the shared pure
   * function so the client calculator and the server cannot disagree. The
   * residence's own payment plan wins; otherwise the property's default plan.
   */
  async scheduleForUnit(unitId: string, startDate?: string) {
    const unit = await this.prisma.client.unit.findUnique({
      where: { id: unitId },
      select: {
        id: true,
        code: true,
        priceMinor: true,
        discountMinor: true,
        promoPriceMinor: true,
        promoEndsAt: true,
        currency: true,
        developmentId: true,
        paymentPlan: { select: milestoneSelect },
        development: { select: { handoverDate: true } },
      },
    });
    if (!unit) throw new NotFoundException(`No unit with id "${unitId}"`);

    const plan =
      unit.paymentPlan ??
      (await this.prisma.client.paymentPlan.findFirst({ where: { developmentId: unit.developmentId, isDefault: true }, select: milestoneSelect }));

    const schedule = computeSchedule(
      { priceMinor: effectivePriceMinor(unit), currency: unit.currency },
      (plan?.milestones ?? []).map((m) => ({
        id: m.id,
        sortOrder: m.sortOrder,
        label: m.label,
        percent: m.percent,
        triggerType: m.triggerType,
        triggerDate: m.triggerDate,
        triggerNote: m.triggerNote,
      })),
      unit.development.handoverDate,
      startDate ? new Date(startDate) : new Date(),
    );

    return { unitId: unit.id, unitCode: unit.code, ...schedule };
  }
}
