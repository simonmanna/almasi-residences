import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AdminGuard } from './admin.guard.js';
import { AuthService } from './auth.service.js';
import { SessionService } from './session.service.js';

@Module({
  controllers: [AdminController],
  providers: [AuthService, SessionService, AdminGuard],
  exports: [AuthService, SessionService, AdminGuard],
})
export class AdminModule {}
