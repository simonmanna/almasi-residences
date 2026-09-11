import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { AdminController } from './admin.controller.js';
import { AdminGuard } from './admin.guard.js';
import { AdminService } from './admin.service.js';
import { AuthService } from './auth.service.js';
import { RevalidateService } from './revalidate.service.js';
import { SessionService } from './session.service.js';

@Module({
  imports: [InventoryModule],
  controllers: [AdminController],
  providers: [AdminService, AuthService, SessionService, AdminGuard, RevalidateService],
})
export class AdminModule {}
