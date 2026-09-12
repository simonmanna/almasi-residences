import { Injectable, NotFoundException } from '@nestjs/common';
import { effectivePriceMinor } from '@avida/types';
import { PrismaService } from '../../common/prisma.service.js';

const LIVE = { published: true, archivedAt: null, floor: { published: true } } as const;

@Injectable()
export class TypologyService {
  constructor(private readonly prisma: PrismaService) {}

  /** §5.3 — typology detail: its published units, plan, media, and the tour it belongs to. */
  async findOne(devSlug: string, typoSlug: string) {
    const typology = await this.prisma.client.typology.findFirst({
      where: { slug: typoSlug, published: true, development: { slug: devSlug } },
      include: {
        units: {
          where: LIVE,
          orderBy: [{ floor: { level: 'asc' } }, { positionIndex: 'asc' }],
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

    const units = typology.units.map(({ discountMinor, promoPriceMinor, promoEndsAt, ...u }) => ({
      ...u,
      priceMinor: effectivePriceMinor({ priceMinor: u.priceMinor, discountMinor, promoPriceMinor, promoEndsAt }),
    }));
    // §4.4 — availability and the "from" price are computed, never stored.
    const available = units.filter((u) => u.status === 'AVAILABLE');
    return {
      ...typology,
      units,
      mediaSets: typology.mediaSets.map((set) => ({
        ...set,
        assets: Object.fromEntries(set.assets.map((a) => [a.timeState, a])),
      })),
      summary: {
        total: units.length,
        available: available.length,
        priceMinorFrom: available.length ? Math.min(...available.map((u) => u.priceMinor)) : null,
        priceMinorTo: available.length ? Math.max(...available.map((u) => u.priceMinor)) : null,
      },
    };
  }

  async list(devSlug: string) {
    const typologies = await this.prisma.client.typology.findMany({
      where: { development: { slug: devSlug }, published: true },
      orderBy: [{ sortOrder: 'asc' }, { areaSqmMin: 'asc' }],
      include: {
        units: { where: LIVE, select: { status: true, priceMinor: true, discountMinor: true, promoPriceMinor: true, promoEndsAt: true } },
        mediaSets: { include: { assets: true }, take: 1 },
      },
    });

    return typologies.map((t) => {
      const available = t.units.filter((u) => u.status === 'AVAILABLE').map((u) => effectivePriceMinor(u));
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
          priceMinorFrom: available.length ? Math.min(...available) : null,
        },
      };
    });
  }
}
