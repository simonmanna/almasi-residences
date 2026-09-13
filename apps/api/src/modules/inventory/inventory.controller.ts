import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { PreviewInterceptor } from '../../common/preview.js';
import { NoStore } from '../../common/cache-control.decorator.js';
import { InventoryService } from './inventory.service.js';

// §40.2 — a signed preview token on the request shows drafts; nothing else does.
@UseInterceptors(PreviewInterceptor)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('live')
  @NoStore()
  live(@Query('development') slug: string) {
    return this.inventory.live(slug);
  }
}
