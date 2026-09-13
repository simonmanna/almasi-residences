import { Injectable, NotFoundException } from '@nestjs/common';
import Redis from 'ioredis';
import { effectivePriceMinor } from '@avida/types';
import { PrismaService } from '../../common/prisma.service.js';
import { live, previewing } from '../../common/preview.js';

/** §4.5 — the hottest query on the site. Cached 30s, busted on any admin write. */
const CACHE_TTL_SECONDS = 30;
const cacheKey = (slug: string) => `inventory:stack:${slug}`;
const liveCacheKey = (slug: string) => `inventory:live:${slug}`;
const LIVE_CACHE_TTL_SECONDS = 10;

/** §32 — only residences the admin has published, and not archived, reach a visitor. */
const LIVE = () => ({ ...live() });

@Injectable()
export class InventoryService {
  /** §6.7 — Redis is an accelerator, never a dependency. Null means "no cache". */
  private readonly redis: Redis | null;

  constructor(private readonly prisma: PrismaService) {
    const url = process.env.REDIS_URL;
    this.redis = url
      ? new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false })
      : null;
    this.redis?.on('error', () => {
      /* §6.7 — a Redis outage degrades to Postgres; it never surfaces to a visitor. */
    });
  }

  async elevationStack(slug: string) {
    // A preview shows unpublished residences: it neither reads nor fills the shared cache.
    const cached = previewing() ? null : await this.readCache(slug);
    if (cached) return cached;

    const dev = await this.prisma.client.development.findUnique({
      where: { slug },
      select: { id: true, currency: true },
    });
    if (!dev) throw new NotFoundException(`No development with slug "${slug}"`);

    const buildings = await this.prisma.client.building.findMany({
      where: { developmentId: dev.id },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        floorCount: true,
        floors: {
          // §2.5 — ground floor at the bottom of the drawing; the client
          // reverses for rendering, the API stays in building order.
          where: { ...live() },
          orderBy: { level: 'asc' },
          select: {
            id: true,
            level: true,
            label: true,
            displayName: true,
            heightM: true,
            units: {
              where: LIVE(),
              orderBy: { positionIndex: 'asc' },
              select: {
                id: true,
                code: true,
                status: true,
                priceMinor: true,
                discountMinor: true,
                promoPriceMinor: true,
                promoEndsAt: true,
                currency: true,
                areaSqm: true,
                bedrooms: true,
                bathrooms: true,
                orientation: true,
                viewTags: true,
                positionIndex: true,
                widthRatio: true,
                meshName: true,
                modelSlot: true,
                featured: true,
                typology: { select: { slug: true, name: true, bedrooms: true, isPenthouse: true } },
              },
            },
          },
        },
      },
    });

    // The price a visitor sees is the price they would pay today (§10).
    const shaped = buildings.map((b) => ({
      ...b,
      floors: b.floors.map((f) => ({
        ...f,
        units: f.units.map(({ discountMinor, promoPriceMinor, promoEndsAt, ...u }) => {
          const now = effectivePriceMinor({ priceMinor: u.priceMinor, discountMinor, promoPriceMinor, promoEndsAt });
          return { ...u, priceMinor: now, listPriceMinor: now !== u.priceMinor ? u.priceMinor : null };
        }),
      })),
    }));

    const units = shaped.flatMap((b) => b.floors.flatMap((f) => f.units));
    const available = units.filter((u) => u.status === 'AVAILABLE');
    const byStatus = units.reduce<Record<string, number>>((acc, u) => {
      acc[u.status] = (acc[u.status] ?? 0) + 1;
      return acc;
    }, {});

    const payload = {
      slug,
      currency: dev.currency,
      buildings: shaped,
      // §4.4 — derived at query time.
      summary: {
        total: units.length,
        byStatus,
        available: available.length,
        percentSold: units.length
          ? Math.round((((byStatus.SOLD ?? 0) + (byStatus.OCCUPIED ?? 0)) / units.length) * 100)
          : 0,
        priceMinorMin: available.length ? Math.min(...available.map((u) => u.priceMinor)) : null,
        priceMinorMax: available.length ? Math.max(...available.map((u) => u.priceMinor)) : null,
      },
      generatedAt: new Date().toISOString(),
    };

    if (!previewing()) await this.writeCache(slug, payload);
    return payload;
  }

  /**
   * §5.3 — status-only delta, no-store, polled by the client every 60s. Kept
   * deliberately tiny: it is the only uncached endpoint on the public API.
   */
  async live(slug: string) {
    const cached = await this.readCacheKey(liveCacheKey(slug));
    if (cached) return cached;
    const units = await this.prisma.client.unit.findMany({
      where: { development: { slug }, ...LIVE(), floor: { ...live() } },
      select: { id: true, status: true, priceMinor: true, discountMinor: true, promoPriceMinor: true, promoEndsAt: true },
      orderBy: { code: 'asc' },
    });
    const payload = {
      units: units.map((u) => ({ id: u.id, status: u.status, priceMinor: effectivePriceMinor(u) })),
      generatedAt: new Date().toISOString(),
    };
    await this.writeCacheKey(liveCacheKey(slug), payload, LIVE_CACHE_TTL_SECONDS);
    return payload;
  }

  /** Called on every admin write a visitor could see (§37). */
  async bustCache(slug: string): Promise<void> {
    try {
      if (this.redis?.status === 'wait') await this.redis.connect();
      await this.redis?.del(cacheKey(slug), liveCacheKey(slug));
    } catch {
      /* a failed bust means a stale read for <=30s, not an error for the caller */
    }
  }

  private async readCache(slug: string): Promise<unknown | null> {
    return this.readCacheKey(cacheKey(slug));
  }

  private async readCacheKey(key: string): Promise<unknown | null> {
    if (!this.redis) return null;
    try {
      if (this.redis.status === 'wait') await this.redis.connect();
      const hit = await this.redis.get(key);
      return hit ? JSON.parse(hit) : null;
    } catch {
      return null; // §6.7 — fall through to Postgres.
    }
  }

  private async writeCache(slug: string, payload: unknown): Promise<void> {
    return this.writeCacheKey(cacheKey(slug), payload, CACHE_TTL_SECONDS);
  }

  private async writeCacheKey(key: string, payload: unknown, ttl: number): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(key, JSON.stringify(payload), 'EX', ttl);
    } catch {
      /* cache write failures are invisible to the visitor */
    }
  }
}
