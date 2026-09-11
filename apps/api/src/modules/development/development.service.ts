import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service.js';

@Injectable()
export class DevelopmentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * §5.3 — the full development payload. Media assets arrive grouped by time
   * state so the client can resolve `TimedImage` without a second request.
   */
  async findBySlug(slug: string) {
    const dev = await this.prisma.client.development.findUnique({
      where: { slug },
      include: {
        typologies: {
          orderBy: { areaSqmMin: 'asc' },
          include: { units: { select: { status: true, priceMinor: true } } },
        },
        amenities: { orderBy: { sortOrder: 'asc' } },
        milestones: { orderBy: { sortOrder: 'asc' } },
        landmarks: { orderBy: { distanceM: 'asc' } },
        faqs: { orderBy: { sortOrder: 'asc' } },
        seo: true,
        mediaSets: { include: { assets: true }, orderBy: { sortOrder: 'asc' } },
        buildings: { select: { id: true, name: true, floorCount: true, modelUrl: true } },
      },
    });
    if (!dev) throw new NotFoundException(`No development with slug "${slug}"`);

    // §4.4 — counts and ranges are computed here, never stored.
    const summary = await this.summarise(dev.id);

    return {
      ...dev,
      // Same per-typology summary as TypologyService.list — the Residences
      // section reads it straight off the development payload.
      typologies: dev.typologies.map(({ units, ...t }) => {
        const available = units.filter((u) => u.status === 'AVAILABLE');
        return {
          ...t,
          summary: {
            total: units.length,
            available: available.length,
            priceMinorFrom: available.length ? Math.min(...available.map((u) => u.priceMinor)) : null,
          },
        };
      }),
      mediaSets: dev.mediaSets.map((set) => ({
        ...set,
        // §6.2 — keyed by time state, so one client state change resolves every image.
        assets: Object.fromEntries(set.assets.map((a) => [a.timeState, a])),
      })),
      summary,
    };
  }

  /** §4.4 — derived values, computed at query time. */
  async summarise(developmentId: string) {
    const [byStatus, prices] = await Promise.all([
      this.prisma.client.unit.groupBy({
        by: ['status'],
        where: { floor: { building: { developmentId } } },
        _count: true,
      }),
      this.prisma.client.unit.aggregate({
        where: { floor: { building: { developmentId } }, status: 'AVAILABLE' },
        _min: { priceMinor: true },
        _max: { priceMinor: true },
      }),
    ]);

    const counts = Object.fromEntries(byStatus.map((r) => [r.status, r._count]));
    const total = byStatus.reduce((acc, r) => acc + r._count, 0);
    const sold = (counts.SOLD ?? 0) + (counts.BOOKED ?? 0);

    return {
      total,
      byStatus: counts,
      available: counts.AVAILABLE ?? 0,
      percentSold: total === 0 ? 0 : Math.round((sold / total) * 100),
      priceMinorMin: prices._min.priceMinor,
      priceMinorMax: prices._max.priceMinor,
    };
  }
}
