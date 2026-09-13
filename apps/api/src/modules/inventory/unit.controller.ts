import { Controller, Get, NotFoundException, Param, UseInterceptors } from '@nestjs/common';
import { PreviewInterceptor } from '../../common/preview.js';
import { effectivePriceMinor } from '@avida/types';
import { PublicCache } from '../../common/cache-control.decorator.js';
import { PrismaService } from '../../common/prisma.service.js';
import { PricingService } from '../pricing/pricing.service.js';
import { live } from '../../common/preview.js';

// §40.2 — a signed preview token on the request shows drafts; nothing else does.
@UseInterceptors(PreviewInterceptor)
@Controller('unit')
export class UnitController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  /**
   * §5.3 — unit detail plus its computed payment schedule and tour entry point.
   * §32 — fields are selected one by one: internal notes, the buyer and the
   * residents are never part of this response.
   */
  @Get(':id')
  @PublicCache()
  async findOne(@Param('id') id: string) {
    const unit = await this.prisma.client.unit.findFirst({
      where: { id, ...live(), floor: { ...live() } },
      select: {
        id: true,
        code: true,
        status: true,
        priceMinor: true,
        discountMinor: true,
        promoPriceMinor: true,
        promoEndsAt: true,
        currency: true,
        areaSqm: true,
        interiorSqm: true,
        balconySqm: true,
        terraceSqm: true,
        bedrooms: true,
        bathrooms: true,
        parkingIncluded: true,
        hasStorage: true,
        orientation: true,
        viewTags: true,
        positionIndex: true,
        widthRatio: true,
        meshName: true,
        modelSlot: true,
        shortDescription: true,
        description: true,
        floor: { select: { level: true, label: true, heightM: true } },
        typology: {
          select: {
            id: true,
            slug: true,
            name: true,
            bedrooms: true,
            bathrooms: true,
            isPenthouse: true,
            floorPlanSvgUrl: true,
            tours: { select: { slug: true, startSceneId: true }, take: 1 },
          },
        },
      },
    });
    if (!unit) throw new NotFoundException(`No unit with id "${id}"`);

    const { discountMinor, promoPriceMinor, promoEndsAt, ...rest } = unit;
    const now = effectivePriceMinor({ priceMinor: unit.priceMinor, discountMinor, promoPriceMinor, promoEndsAt });
    const schedule = await this.pricing.scheduleForUnit(id);
    return { ...rest, priceMinor: now, listPriceMinor: now !== unit.priceMinor ? unit.priceMinor : null, schedule };
  }
}
