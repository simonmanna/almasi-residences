import { Injectable, NotFoundException } from '@nestjs/common';
import { computeSchedule } from '@avida/types';
import { PrismaService } from '../../common/prisma.service.js';

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * §5.6 — the API resolves the data; the arithmetic lives in the shared pure
   * function so the client calculator and the server cannot disagree.
   */
  async scheduleForUnit(unitId: string, startDate?: string) {
    const unit = await this.prisma.client.unit.findUnique({
      where: { id: unitId },
      select: {
        id: true,
        code: true,
        priceMinor: true,
        currency: true,
        floor: {
          select: {
            building: {
              select: {
                development: {
                  select: {
                    handoverDate: true,
                    milestones: { orderBy: { sortOrder: 'asc' } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!unit) throw new NotFoundException(`No unit with id "${unitId}"`);

    const dev = unit.floor.building.development;
    const schedule = computeSchedule(
      { priceMinor: unit.priceMinor, currency: unit.currency },
      dev.milestones.map((m) => ({
        id: m.id,
        sortOrder: m.sortOrder,
        label: m.label,
        percent: m.percent,
        triggerType: m.triggerType,
        triggerDate: m.triggerDate,
        triggerNote: m.triggerNote,
      })),
      dev.handoverDate,
      startDate ? new Date(startDate) : new Date(),
    );

    return { unitId: unit.id, unitCode: unit.code, ...schedule };
  }
}
