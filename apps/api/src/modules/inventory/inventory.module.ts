import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module.js';
import { InventoryController } from './inventory.controller.js';
import { InventoryService } from './inventory.service.js';
import { UnitController } from './unit.controller.js';

@Module({
  imports: [PricingModule],
  controllers: [InventoryController, UnitController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
