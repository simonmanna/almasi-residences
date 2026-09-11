import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { DevelopmentController } from './development.controller.js';
import { DevelopmentService } from './development.service.js';

@Module({
  imports: [InventoryModule],
  controllers: [DevelopmentController],
  providers: [DevelopmentService],
  exports: [DevelopmentService],
})
export class DevelopmentModule {}
