import { Body, Controller, Post } from '@nestjs/common';
import { PublicCache } from '../../common/cache-control.decorator.js';
import { ScheduleRequestDto } from './schedule.dto.js';
import { PricingService } from './pricing.service.js';

@Controller('pricing')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Post('schedule')
  @PublicCache()
  schedule(@Body() body: ScheduleRequestDto) {
    return this.pricing.scheduleForUnit(body.unitId, body.startDate);
  }
}
