import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PublicCache } from '../../common/cache-control.decorator.js';
import { PrismaService } from '../../common/prisma.service.js';
import { PricingService } from '../pricing/pricing.service.js';

@Controller('unit')
export class UnitController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  /** §5.3 — unit detail plus its computed payment schedule and tour entry point. */
  @Get(':id')
  @PublicCache()
  async findOne(@Param('id') id: string) {
    const unit = await this.prisma.client.unit.findUnique({
      where: { id },
      include: {
        floor: { select: { level: true, label: true, heightM: true } },
        typology: {
          select: {
            id: true,
            slug: true,
            name: true,
            bedrooms: true,
            bathrooms: true,
            floorPlanSvgUrl: true,
            tours: { select: { slug: true, startSceneId: true }, take: 1 },
          },
        },
      },
    });
    if (!unit) throw new NotFoundException(`No unit with id "${id}"`);

    const schedule = await this.pricing.scheduleForUnit(id);
    return { ...unit, schedule };
  }
}
