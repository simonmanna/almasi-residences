import { Controller, Get, Param } from '@nestjs/common';
import { PublicCache } from '../../common/cache-control.decorator.js';
import { PrismaService } from '../../common/prisma.service.js';
import { DevelopmentService } from './development.service.js';
import { InventoryService } from '../inventory/inventory.service.js';

@Controller('development')
export class DevelopmentController {
  constructor(
    private readonly development: DevelopmentService,
    private readonly inventory: InventoryService,
    private readonly prisma: PrismaService,
  ) {}

  @Get(':slug')
  @PublicCache()
  find(@Param('slug') slug: string) {
    return this.development.findBySlug(slug);
  }

  /** §9 Phase 6 — dated construction progress. */
  @Get(':slug/progress')
  @PublicCache()
  progress(@Param('slug') slug: string) {
    return this.prisma.client.progressUpdate.findMany({
      where: { development: { slug } },
      orderBy: { capturedOn: 'desc' },
    });
  }

  /** §5.3 — the elevation stack payload (§2.5). */
  @Get(':slug/inventory')
  @PublicCache()
  inventoryFor(@Param('slug') slug: string) {
    return this.inventory.elevationStack(slug);
  }
}
