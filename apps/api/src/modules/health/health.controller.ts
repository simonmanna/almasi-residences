import { Controller, Get } from '@nestjs/common';
import { NoStore } from '../../common/cache-control.decorator.js';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Liveness — is the process up. Must not touch the database. */
  @Get()
  @NoStore()
  live() {
    return { status: 'ok', uptimeSec: Math.round(process.uptime()) };
  }

  /** §11 — readiness. The uptime check points here; it reaches every dependency. */
  @Get('deep')
  @NoStore()
  deep() {
    return this.health.deep();
  }
}
