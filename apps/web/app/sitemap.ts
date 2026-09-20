import type { MetadataRoute } from 'next';
import { getInsights, getInventory, getLocationPages, getResidenceCards, getSeoEntities } from '../lib/api';
import { toResidences } from '../lib/residences';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/** A media URL may be API-relative; a sitemap needs the absolute one. */
const absolute = (url: string) => (url.startsWith('http') ? url : `${SITE}${url}`);

/**
 * Every public page, and one entry per residence, neighbourhood and article the
 * API reports — never a hardcoded list.
 *
 * Residence entries carry their photographs (an image sitemap, inline), so the
 * renders are discoverable as images rather than only as page decoration.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Audit §21.4 — a failed read throws, so revalidation keeps the last good sitemap
  // rather than publishing one with every residence missing.
  const residences = toResidences(await getInventory());
  const [locations, posts, cards, unitSeo, locationSeo, postSeo] = await Promise.all([
    getLocationPages().catch(() => []),
    getInsights().catch(() => []),
    getResidenceCards().catch(() => []),
    getSeoEntities('UNIT').catch(() => ({})),
    getSeoEntities('LOCATION_PAGE').catch(() => ({})),
    getSeoEntities('POST').catch(() => ({})),
  ]);
  // A page the admin hid from search does not belong in the sitemap: asking a
  // crawler to fetch what it is told to ignore is a contradiction.
  const indexable = (seo: Record<string, { robotsIndex: boolean }>, id: string) => seo[id]?.robotsIndex !== false;
  const now = new Date();

  const pages: MetadataRoute.Sitemap = [
    { url: SITE, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE}/residences`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE}/tour`, lastModified: now, priority: 0.8 },
    { url: `${SITE}/3d-design`, lastModified: now, priority: 0.8 },
    { url: `${SITE}/tour/penthouse`, lastModified: now, priority: 0.7 },
    { url: `${SITE}/amenities`, lastModified: now, priority: 0.7 },
    { url: `${SITE}/location`, lastModified: now, priority: 0.7 },
    { url: `${SITE}/gallery`, lastModified: now, priority: 0.6 },
    { url: `${SITE}/film`, lastModified: now, priority: 0.6 },
    { url: `${SITE}/buying`, lastModified: now, priority: 0.7 },
    { url: `${SITE}/progress`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE}/enquire`, lastModified: now, priority: 0.6 },
    { url: `${SITE}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ];

  // Only listed when there is something to list: an index of nothing is an
  // invitation to crawl an empty page.
  if (locations.length) pages.push({ url: `${SITE}/locations`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 });
  if (posts.length) pages.push({ url: `${SITE}/insights`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 });

  // The picture each residence shows on its card — one read for all of them,
  // rather than one page fetch per home.
  const residenceImages = new Map(cards.filter((c) => c.cover).map((c) => [c.slug, [absolute(c.cover!.url)]]));

  return [
    ...pages,
    ...residences.filter((r) => indexable(unitSeo, r.id)).map((r) => ({
      url: `${SITE}/residences/${r.slug}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: r.publicStatus === 'available' ? 0.8 : 0.5,
      ...(residenceImages.get(r.slug)?.length ? { images: residenceImages.get(r.slug) } : {}),
    })),
    ...locations.filter((l) => indexable(locationSeo, l.id)).map((l) => ({
      url: `${SITE}/locations/${l.slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
      ...(l.hero ? { images: [absolute(l.hero.url)] } : {}),
    })),
    ...posts.filter((p) => indexable(postSeo, p.id)).map((p) => ({
      url: `${SITE}/insights/${p.slug}`,
      lastModified: new Date(p.updatedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
      ...(p.hero ? { images: [absolute(p.hero.url)] } : {}),
    })),
  ];
}
