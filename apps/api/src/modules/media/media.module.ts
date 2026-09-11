import { Module } from '@nestjs/common';
import { AdminGuard } from '../admin/admin.guard.js';
import { SessionService } from '../admin/session.service.js';
import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';

@Module({
  controllers: [MediaController],
  providers: [MediaService, AdminGuard, SessionService],
})
export class MediaModule {}
