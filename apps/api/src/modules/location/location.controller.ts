import { Controller, Get, Param, Query } from '@nestjs/common';
import { PublicCache } from '../../common/cache-control.decorator.js';
import { PrismaService } from '../../common/prisma.service.js';

@Controller('location')
export class LocationController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * §5.3 — landmarks with distances. Distances were computed by PostGIS at seed
   * time (§4.5); travel times are modelled estimates and labelled as such in
   * the UI (§13).
   */
  @Get(':devSlug/landmarks')
  @PublicCache()
  async landmarks(@Param('devSlug') devSlug: string, @Query('category') category?: string) {
    return this.prisma.client.landmark.findMany({
      where: {
        development: { slug: devSlug },
        ...(category ? { category: category as never } : {}),
      },
      orderBy: { distanceM: 'asc' },
    });
  }
}
