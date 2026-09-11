import { Module } from '@nestjs/common';
import { EnquiryController } from './enquiry.controller.js';
import { EnquiryService } from './enquiry.service.js';
import { NotifyService } from './notify.service.js';
import { TurnstileService } from './turnstile.service.js';

@Module({
  controllers: [EnquiryController],
  providers: [EnquiryService, TurnstileService, NotifyService],
  exports: [EnquiryService],
})
export class EnquiryModule {}
