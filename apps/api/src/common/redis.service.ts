import { Global, Injectable, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * One Redis connection for the things that must be shared across API processes:
 * rate-limit counters and the session denylist. Distinct from the caches in
 * InventoryService and MediaService, which are accelerators and may be absent.
 *
 * Here absence is a decision, not a shrug: without Redis the rate limiter is
 * per-process and sessions cannot be revoked before they expire. That is
 * tolerable in development and is refused in production (see `assertReady`).
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly log = new Logger(RedisService.name);
  readonly client: Redis | null;

  constructor() {
    const url = process.env.REDIS_URL;
    this.client = url
      ? new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 2, enableOfflineQueue: true })
      : null;
    this.client?.on('error', (e) => this.log.warn(`Redis: ${e.message}`));
    if (!this.client) this.log.warn('REDIS_URL is not set: rate limits are per-process and sessions cannot be revoked.');
  }

  /** Shared state is not optional in production. */
  static assertReady(): void {
    if (process.env.NODE_ENV === 'production' && !process.env.REDIS_URL) {
      throw new Error(
        'REDIS_URL must be set in production: without it the rate limiter is per-process and a signed-out session stays valid until it expires.',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit().catch(() => undefined);
  }
}

@Global()
@Module({ providers: [RedisService], exports: [RedisService] })
export class RedisModule {}
