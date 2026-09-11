import { Body, Controller, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { NoStore } from '../../common/cache-control.decorator.js';
import { AskDto } from './concierge.dto.js';
import { ConciergeService } from './concierge.service.js';

@Controller('concierge')
export class ConciergeController {
  constructor(private readonly concierge: ConciergeService) {}

  /** A model call per request, so this is rate limited harder than a read. */
  @Post(':devSlug/ask')
  @Throttle({ default: { limit: 20, ttl: 600_000 } })
  @NoStore()
  ask(@Param('devSlug') devSlug: string, @Body() dto: AskDto) {
    return this.concierge.ask(devSlug, dto.question, dto.narrate ?? false);
  }
}
