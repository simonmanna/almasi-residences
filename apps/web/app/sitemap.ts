import type { MetadataRoute } from 'next';
import { getInventory } from '../lib/api';
import { toResidences } from '../lib/residences';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/** Every public page, and one entry per residence the API reports — never a hardcoded list. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const residences = await getInventory()
    .then((inv) => toResidences(inv))
    .catch(() => []);
  const now = new Date();

  const pages: MetadataRoute.Sitemap = [
    { url: SITE, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE}/residences`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE}/tour`, lastModified: now, priority: 0.8 },
    { url: `${SITE}/tour/penthouse`, lastModified: now, priority: 0.7 },
    { url: `${SITE}/amenities`, lastModified: now, priority: 0.7 },
    { url: `${SITE}/location`, lastModified: now, priority: 0.7 },
    { url: `${SITE}/gallery`, lastModified: now, priority: 0.6 },
    { url: `${SITE}/film`, lastModified: now, priority: 0.6 },
    { url: `${SITE}/buying`, lastModified: now, priority: 0.7 },
    { url: `${SITE}/enquire`, lastModified: now, priority: 0.6 },
  ];

  return [
    ...pages,
    ...residences.map((r) => ({
      url: `${SITE}/residences/${r.slug}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: r.publicStatus === 'available' ? 0.8 : 0.5,
    })),
  ];
}
