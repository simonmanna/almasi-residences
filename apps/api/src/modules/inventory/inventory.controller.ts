import { Controller, Get, Query } from '@nestjs/common';
import { NoStore } from '../../common/cache-control.decorator.js';
import { InventoryService } from './inventory.service.js';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('live')
  @NoStore()
  live(@Query('development') slug: string) {
    return this.inventory.live(slug);
  }
}
