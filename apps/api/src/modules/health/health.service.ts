import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../../common/prisma.service.js';

interface DependencyResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async deep() {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    const body = {
      status: database.ok && redis.ok ? 'ok' : 'degraded',
      checks: { database, redis },
      version: process.env.npm_package_version ?? '0.0.0',
    };
    // §6.7 — Redis down is degraded, not dead: inventory falls through to
    // Postgres. Postgres down is a real outage.
    if (!database.ok) throw new ServiceUnavailableException(body);
    return body;
  }

  private async checkDatabase(): Promise<DependencyResult> {
    const started = Date.now();
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
      return { ok: true, latencyMs: Date.now() - started };
    } catch (error) {
      return { ok: false, latencyMs: Date.now() - started, error: (error as Error).message };
    }
  }

  private async checkRedis(): Promise<DependencyResult> {
    const started = Date.now();
    const url = process.env.REDIS_URL;
    if (!url) return { ok: false, latencyMs: 0, error: 'REDIS_URL not set' };
    const client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
    try {
      await client.connect();
      await client.ping();
      return { ok: true, latencyMs: Date.now() - started };
    } catch (error) {
      return { ok: false, latencyMs: Date.now() - started, error: (error as Error).message };
    } finally {
      client.disconnect();
    }
  }
}
