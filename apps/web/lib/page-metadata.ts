import type { Metadata } from 'next';
import { fillCopyTokens, formatQuarter } from '@avida/types';
import { getDevelopment, getInventory, getSeo } from './api';
import { copyTokenValues } from './copy-tokens';
import { summarise, toResidences } from './residences';

/**
 * §5.6 — a route's metadata from the admin (Website → SEO). The route's own
 * title/description win; the site-wide SeoMeta fills anything left empty;
 * `fallback.title` only names the page when the admin has written nothing.
 * Live figures in braces are filled from the inventory, so a description never
 * promises a count the admin has since changed.
 */
export async function pageMetadata(path: string, fallback: { title?: string } = {}): Promise<Metadata> {
  const [seo, inventory, dev] = await Promise.all([getSeo().catch(() => null), getInventory().catch(() => null), getDevelopment().catch(() => null)]);
  const page = seo?.pages[path];
  const values = inventory
    ? copyTokenValues(summarise(toResidences(inventory)), { handover: dev?.handoverDate ? formatQuarter(dev.handoverDate) : null, name: dev?.name })
    : {};
  const fill = (t: string | null | undefined) => (t ? fillCopyTokens(t, values) : undefined);

  const title = fill(page?.title) ?? fallback.title;
  const description = fill(page?.description) ?? fill(seo?.site?.description);
  const image = page?.ogImage;

  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    alternates: { canonical: path },
    ...(page?.noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(image ? { images: [{ url: image.url, width: image.width ?? undefined, height: image.height ?? undefined, alt: image.altText ?? title ?? '' }] } : {}),
    },
  };
}
