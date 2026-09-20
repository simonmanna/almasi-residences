import { Injectable, NotFoundException } from '@nestjs/common';
import { SEO_ENTITY_SCHEMA_DEFAULT, type SeoEntityType } from '@avida/types';
import { CurrentDevelopment } from '../../common/current-development.service.js';
import { previewing } from '../../common/preview.js';
import { PrismaService } from '../../common/prisma.service.js';
import { PublicService } from './public.service.js';

/**
 * §SEO — what the website needs to render a findable page: the metadata of one
 * record whatever kind it is, the redirects that keep old links alive, the
 * neighbourhood pages and the articles.
 *
 * Nothing private travels here: a SeoEntity row holds only what is printed in
 * the page's head anyway.
 */
@Injectable()
export class SeoPublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dev: CurrentDevelopment,
    private readonly pub: PublicService,
  ) {}

  /** Every enabled redirect, small enough for the website to hold in memory. */
  async redirects() {
    const developmentId = await this.dev.id();
    const rows = await this.prisma.client.redirect.findMany({
      where: { developmentId, enabled: true },
      orderBy: { fromPath: 'asc' },
      select: { fromPath: true, toPath: true, statusCode: true },
    });
    return rows;
  }

  /** Counted when the website actually serves one, so dead rules are visible. */
  async recordRedirectHit(fromPath: string) {
    const developmentId = await this.dev.id();
    await this.prisma.client.redirect.updateMany({
      where: { developmentId, fromPath, enabled: true },
      data: { hits: { increment: 1 }, lastHitAt: new Date() },
    });
  }

  /** The metadata overrides for one kind of record, keyed by the record's id. */
  async entities(type: SeoEntityType) {
    const developmentId = await this.dev.id();
    const rows = await this.prisma.client.seoEntity.findMany({
      where: { developmentId, entityType: type },
      include: { ogImage: true },
    });
    return Object.fromEntries(rows.map((r) => [r.entityId, this.present(r, type)]));
  }

  async locationPages() {
    const developmentId = await this.dev.id();
    const rows = await this.prisma.client.locationPage.findMany({
      where: { developmentId, ...(shownOnly() ? { published: true } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { heroImage: true },
    });
    return rows.map((r) => this.locationCard(r));
  }

  async locationPage(slug: string) {
    const developmentId = await this.dev.id();
    const row = await this.prisma.client.locationPage.findFirst({
      where: { developmentId, slug, ...(shownOnly() ? { published: true } : {}) },
      include: { heroImage: true },
    });
    if (!row) throw new NotFoundException('No such location page');
    const [landmarks, seo, dev] = await Promise.all([
      this.prisma.client.landmark.findMany({
        where: { developmentId, visible: true, ...(row.categories.length ? { category: { in: row.categories as never } } : {}) },
        orderBy: { distanceM: 'asc' },
        select: { id: true, name: true, category: true, latitude: true, longitude: true, distanceM: true, driveMinutes: true, walkMinutes: true },
      }),
      this.prisma.client.seoEntity.findUnique({
        where: { developmentId_entityType_entityId: { developmentId, entityType: 'LOCATION_PAGE', entityId: row.id } },
        include: { ogImage: true },
      }),
      this.prisma.client.development.findUnique({ where: { id: developmentId }, select: { latitude: true, longitude: true } }),
    ]);
    return {
      ...this.locationCard(row),
      body: row.body,
      landmarks,
      // A page about a place needs a place: its own coordinates when it has
      // them, the development's otherwise.
      latitude: row.latitude ?? dev?.latitude ?? null,
      longitude: row.longitude ?? dev?.longitude ?? null,
      seo: seo ? this.present(seo, 'LOCATION_PAGE') : null,
    };
  }

  async posts(limit?: number) {
    const developmentId = await this.dev.id();
    const rows = await this.prisma.client.post.findMany({
      where: { developmentId, ...(shownOnly() ? { published: true } : {}) },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      ...(limit ? { take: limit } : {}),
      include: { heroImage: true },
    });
    return rows.map((r) => this.postCard(r));
  }

  async post(slug: string) {
    const developmentId = await this.dev.id();
    const row = await this.prisma.client.post.findFirst({
      where: { developmentId, slug, ...(shownOnly() ? { published: true } : {}) },
      include: { heroImage: true },
    });
    if (!row) throw new NotFoundException('No such article');
    const [seo, related] = await Promise.all([
      this.prisma.client.seoEntity.findUnique({
        where: { developmentId_entityType_entityId: { developmentId, entityType: 'POST', entityId: row.id } },
        include: { ogImage: true },
      }),
      this.prisma.client.post.findMany({
        where: { developmentId, published: true, id: { not: row.id }, category: row.category },
        orderBy: [{ publishedAt: 'desc' }],
        take: 3,
        include: { heroImage: true },
      }),
    ]);
    return {
      ...this.postCard(row),
      body: row.body,
      seo: seo ? this.present(seo, 'POST') : null,
      related: related.map((r) => this.postCard(r)),
    };
  }

  /** The film and its walkthroughs, with what a VideoObject needs. */
  async videos() {
    const developmentId = await this.dev.id();
    const rows = await this.prisma.client.videoAsset.findMany({
      where: { developmentId, published: true },
      select: {
        key: true,
        label: true,
        description: true,
        durationSec: true,
        transcript: true,
        uploadDate: true,
        createdAt: true,
        media: true,
        posterMedia: true,
        chapters: { orderBy: { sortOrder: 'asc' }, select: { startSec: true, label: true, place: true } },
      },
    });
    return rows.map((v) => ({
      key: v.key,
      label: v.label,
      description: v.description,
      durationSec: v.durationSec,
      transcript: v.transcript,
      uploadDate: (v.uploadDate ?? v.createdAt).toISOString(),
      video: this.pub.mediaOrNull(v.media),
      poster: this.pub.mediaOrNull(v.posterMedia),
      chapters: v.chapters,
    }));
  }

  private locationCard(row: { id: string; slug: string; name: string; kicker: string | null; title: string | null; lede: string | null; locality: string | null; region: string | null; country: string; categories: string[]; published: boolean; heroImage: Parameters<PublicService['mediaOrNull']>[0] }) {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      kicker: row.kicker,
      title: row.title,
      lede: row.lede,
      locality: row.locality,
      region: row.region,
      country: row.country,
      categories: row.categories,
      published: row.published,
      hero: this.pub.mediaOrNull(row.heroImage),
    };
  }

  private postCard(row: { id: string; slug: string; title: string; excerpt: string | null; category: string; tags: string[]; authorName: string | null; readMinutes: number | null; publishedAt: Date | null; updatedAt: Date; heroImage: Parameters<PublicService['mediaOrNull']>[0] }) {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
      category: row.category,
      tags: row.tags,
      authorName: row.authorName,
      readMinutes: row.readMinutes,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
      hero: this.pub.mediaOrNull(row.heroImage),
    };
  }

  /** One metadata row as the website reads it: overrides only, plus the schema type to emit. */
  private present(
    row: {
      title: string | null;
      metaDescription: string | null;
      canonicalUrl: string | null;
      ogTitle: string | null;
      ogDescription: string | null;
      robotsIndex: boolean;
      robotsFollow: boolean;
      schemaType: string | null;
      keywords: string[];
      ogImage: Parameters<PublicService['mediaOrNull']>[0];
    },
    type: SeoEntityType,
  ) {
    return {
      title: row.title,
      description: row.metaDescription,
      canonicalUrl: row.canonicalUrl,
      ogTitle: row.ogTitle ?? row.title,
      ogDescription: row.ogDescription ?? row.metaDescription,
      ogImage: this.pub.mediaOrNull(row.ogImage),
      robotsIndex: row.robotsIndex,
      robotsFollow: row.robotsFollow,
      schemaType: row.schemaType ?? SEO_ENTITY_SCHEMA_DEFAULT[type],
      keywords: row.keywords,
    };
  }
}

/** Outside a signed preview, only published records exist. */
function shownOnly(): boolean {
  return !previewing();
}
