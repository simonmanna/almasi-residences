import type { Metadata } from 'next';
import { clampDescription, fillCopyTokens, formatQuarter, seoRoute } from '@avida/types';
import { getDevelopment, getInventory, getSeo, type SeoEntityDto } from './api';
import { copyTokenValues } from './copy-tokens';
import { summarise, toResidences } from './residences';

/**
 * The picture a link to the site shows when a page has none of its own
 * (app/opengraph-image.jpg). A page that sets `openGraph` replaces the root
 * layout's whole block — image included — so each page names it again.
 */
const SHARE_IMAGE = { url: '/opengraph-image.jpg', width: 1200, height: 630 };

/**
 * §5.6 — a route's metadata from the admin (Website → SEO). The route's own
 * title/description win; the site-wide SeoMeta fills anything left empty;
 * the route's default (SEO_ROUTES), or `fallback.title` for a route outside
 * it, only names the page when the admin has written nothing.
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

  const route = seoRoute(path);
  const title = fill(page?.title) ?? route?.title ?? fallback.title;
  const description = fill(page?.description) ?? fill(route?.description) ?? fill(seo?.site?.description);
  const image = page?.ogImage;

  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    alternates: { canonical: path },
    ...(page?.noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      type: 'website',
      ...(dev?.name ? { siteName: dev.name } : {}),
      locale: 'en_GB',
      url: path,
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      images: [image ? { url: image.url, width: image.width ?? undefined, height: image.height ?? undefined, alt: image.altText ?? title ?? '' } : SHARE_IMAGE],
    },
  };
}

/**
 * §SEO — the metadata of one record: what the admin wrote wins, what it left
 * empty is derived from the record itself. Every page built this way ends up
 * with a title, a description, a canonical and an honest robots directive.
 */
export function entityMetadata(opts: {
  path: string;
  derivedTitle: string;
  derivedDescription: string;
  image?: { url: string; width?: number | null; height?: number | null; altText?: string | null } | null;
  seo?: SeoEntityDto | null;
  type?: 'article' | 'website';
  publishedTime?: string | null;
  modifiedTime?: string | null;
}): Metadata {
  const seo = opts.seo ?? null;
  const title = seo?.title?.trim() || opts.derivedTitle;
  const description = clampDescription(seo?.description?.trim() || opts.derivedDescription);
  const image = seo?.ogImage ?? opts.image ?? null;
  const index = seo?.robotsIndex ?? true;
  const follow = seo?.robotsFollow ?? true;
  return {
    title,
    description,
    alternates: { canonical: seo?.canonicalUrl?.trim() || opts.path },
    ...(seo?.keywords?.length ? { keywords: seo.keywords } : {}),
    ...(index && follow ? {} : { robots: { index, follow } }),
    openGraph: {
      type: opts.type ?? 'website',
      title: seo?.ogTitle?.trim() || title,
      description: seo?.ogDescription?.trim() || description,
      url: opts.path,
      ...(opts.publishedTime ? { publishedTime: opts.publishedTime } : {}),
      ...(opts.modifiedTime ? { modifiedTime: opts.modifiedTime } : {}),
      images: [image ? { url: image.url, width: image.width ?? undefined, height: image.height ?? undefined, alt: image.altText ?? title } : SHARE_IMAGE],
    },
  };
}
