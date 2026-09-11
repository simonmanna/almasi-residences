import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service.js';

@Injectable()
export class TypologyService {
  constructor(private readonly prisma: PrismaService) {}

  /** §5.3 — typology detail: its units, plan, media, and the tour it belongs to. */
  async findOne(devSlug: string, typoSlug: string) {
    const typology = await this.prisma.client.typology.findFirst({
      where: { slug: typoSlug, development: { slug: devSlug } },
      include: {
        units: {
          orderBy: [{ floor: { level: 'asc' } }, { positionIndex: 'asc' }],
          select: {
            id: true,
            code: true,
            status: true,
            priceMinor: true,
            currency: true,
            areaSqm: true,
            balconySqm: true,
            orientation: true,
            viewTags: true,
            floor: { select: { level: true, label: true } },
          },
        },
        tours: { select: { id: true, slug: true, name: true, startSceneId: true } },
        mediaSets: { include: { assets: true } },
      },
    });
    if (!typology) throw new NotFoundException(`No typology "${typoSlug}" in "${devSlug}"`);

    // §4.4 — availability and the "from" price are computed, never stored.
    const available = typology.units.filter((u) => u.status === 'AVAILABLE');
    return {
      ...typology,
      mediaSets: typology.mediaSets.map((set) => ({
        ...set,
        assets: Object.fromEntries(set.assets.map((a) => [a.timeState, a])),
      })),
      summary: {
        total: typology.units.length,
        available: available.length,
        priceMinorFrom: available.length ? Math.min(...available.map((u) => u.priceMinor)) : null,
        priceMinorTo: available.length ? Math.max(...available.map((u) => u.priceMinor)) : null,
      },
    };
  }

  async list(devSlug: string) {
    const typologies = await this.prisma.client.typology.findMany({
      where: { development: { slug: devSlug } },
      orderBy: { areaSqmMin: 'asc' },
      include: {
        units: { select: { status: true, priceMinor: true } },
        mediaSets: { include: { assets: true }, take: 1 },
      },
    });

    return typologies.map((t) => {
      const available = t.units.filter((u) => u.status === 'AVAILABLE');
      const { units, mediaSets, ...rest } = t;
      return {
        ...rest,
        mediaSets: mediaSets.map((set) => ({
          ...set,
          assets: Object.fromEntries(set.assets.map((a) => [a.timeState, a])),
        })),
        summary: {
          total: units.length,
          available: available.length,
          priceMinorFrom: available.length ? Math.min(...available.map((u) => u.priceMinor)) : null,
        },
      };
    });
  }
}
