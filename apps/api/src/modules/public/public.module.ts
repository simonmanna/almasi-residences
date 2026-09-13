import { Module } from '@nestjs/common';
import { FilesController } from '../files/files.controller.js';
import { AnalyticsController } from './analytics.controller.js';
import { BrochureService } from './brochure.service.js';
import { PublicController } from './public.controller.js';
import { PublicService } from './public.service.js';

@Module({
  controllers: [PublicController, FilesController, AnalyticsController],
  providers: [PublicService, BrochureService],
  exports: [PublicService],
})
export class PublicModule {}
