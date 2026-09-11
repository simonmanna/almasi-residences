import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PublicCache } from '../../common/cache-control.decorator.js';
import { PrismaService } from '../../common/prisma.service.js';

@Controller()
export class TourController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * §5.3 / §8.2 — the tour's node graph, built from the database so adding a
   * scene in the admin appears in the live tour with no deploy.
   */
  @Get('tour/:devSlug/:tourSlug')
  @PublicCache()
  async tour(@Param('devSlug') devSlug: string, @Param('tourSlug') tourSlug: string) {
    const tour = await this.prisma.client.tour.findFirst({
      where: { slug: tourSlug, development: { slug: devSlug } },
      include: {
        typology: { select: { slug: true, name: true, floorPlanSvgUrl: true } },
        scenes: {
          orderBy: { sortOrder: 'asc' },
          include: {
            panoramas: true,
            hotspots: {
              include: { targetScene: { select: { id: true, key: true, label: true } } },
            },
          },
        },
      },
    });
    if (!tour) throw new NotFoundException(`No tour "${tourSlug}" in "${devSlug}"`);

    return {
      ...tour,
      scenes: tour.scenes.map((scene) => ({
        ...scene,
        // §6.2 — panoramas keyed by time state, like every other media set, so
        // the global scrubber resolves them with no bespoke wiring.
        panoramas: Object.fromEntries(scene.panoramas.map((p) => [p.timeState, p])),
      })),
    };
  }

  /** §5.3 — a video plus its chapters, each of which links to a tour scene (§7.7). */
  @Get('video/:key')
  @PublicCache()
  async video(@Param('key') key: string) {
    const video = await this.prisma.client.videoAsset.findUnique({
      where: { key },
      include: { chapters: { orderBy: { startSec: 'asc' } } },
    });
    if (!video) throw new NotFoundException(`No video "${key}"`);
    return video;
  }

  /** §5.3 — a frame sequence manifest plus its hotspot map (§8.5). */
  @Get('frames/:key')
  @PublicCache()
  async frames(@Param('key') key: string) {
    const sequence = await this.prisma.client.frameSequence.findUnique({ where: { key } });
    if (!sequence) throw new NotFoundException(`No frame sequence "${key}"`);
    return sequence;
  }
}
