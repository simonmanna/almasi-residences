import { Module } from '@nestjs/common';
import { FilesController } from '../files/files.controller.js';
import { AnalyticsController } from './analytics.controller.js';
import { BrochureService } from './brochure.service.js';
import { PublicController } from './public.controller.js';
import { PublicService } from './public.service.js';
import { SeoPublicService } from './seo-public.service.js';
import { PricingModule } from '../pricing/pricing.module.js';

@Module({
  imports: [PricingModule],
  controllers: [PublicController, FilesController, AnalyticsController],
  providers: [PublicService, BrochureService, SeoPublicService],
  exports: [PublicService, SeoPublicService],
})
export class PublicModule {}
