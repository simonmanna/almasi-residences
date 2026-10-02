/**
 * §SEO — the vocabulary shared by the API, the admin and the website.
 *
 * One engine serves every page type: a record of any kind may carry search
 * metadata, and anything left empty is derived from the record itself rather
 * than left blank on the page.
 */

export const SEO_ENTITY_TYPES = ['UNIT', 'TYPOLOGY', 'LOCATION_PAGE', 'POST', 'AMENITY', 'GALLERY', 'FLOOR'] as const;
export type SeoEntityType = (typeof SEO_ENTITY_TYPES)[number];

export const SEO_ENTITY_LABELS: Record<SeoEntityType, string> = {
  UNIT: 'Residence',
  TYPOLOGY: 'Residence type',
  LOCATION_PAGE: 'Location page',
  POST: 'Article',
  AMENITY: 'Amenity',
  GALLERY: 'Gallery',
  FLOOR: 'Floor',
};

/** The schema.org types a page of this site may legitimately claim. */
export const SCHEMA_TYPES = ['Apartment', 'Residence', 'Accommodation', 'Place', 'Article', 'BlogPosting', 'Organization', 'ImageGallery', 'WebPage'] as const;
export type SchemaType = (typeof SCHEMA_TYPES)[number];

export const SEO_ENTITY_SCHEMA_DEFAULT: Record<SeoEntityType, SchemaType> = {
  UNIT: 'Apartment',
  TYPOLOGY: 'Accommodation',
  LOCATION_PAGE: 'Place',
  POST: 'Article',
  AMENITY: 'Place',
  GALLERY: 'ImageGallery',
  FLOOR: 'WebPage',
};

/** Where each entity's page lives on the website. */
export function seoEntityPath(type: SeoEntityType, slug: string): string {
  switch (type) {
    case 'UNIT':
      return `/residences/${slug}`;
    case 'TYPOLOGY':
      return `/residences?type=${slug}`;
    case 'LOCATION_PAGE':
      return `/locations/${slug}`;
    case 'POST':
      return `/insights/${slug}`;
    case 'AMENITY':
      return `/amenities#${slug}`;
    case 'GALLERY':
      // The galleries all live on one page; a set is an anchor on it.
      return `/gallery#${slug}`;
    case 'FLOOR':
      return `/residences?floor=${slug}`;
  }
}

export const POST_CATEGORIES = ['Guides', 'Neighbourhood', 'Investment', 'Design', 'Progress', 'News'] as const;
export type PostCategory = (typeof POST_CATEGORIES)[number];

// ─── Health ──────────────────────────────────────────────────────────────

export type SeoIssueKind =
  | 'missing-title'
  | 'missing-description'
  | 'title-too-long'
  | 'description-too-long'
  | 'duplicate-title'
  | 'duplicate-description'
  | 'missing-og-image'
  | 'noindex'
  | 'missing-alt-text'
  | 'missing-transcript'
  | 'orphan-page'
  | 'redirect-loop'
  | 'redirect-hides-page';

export interface SeoIssue {
  kind: SeoIssueKind;
  /** The page or record it concerns, as a path where there is one. */
  path: string;
  label: string;
  detail?: string;
  severity: 'error' | 'warning';
}

export const SEO_ISSUE_LABELS: Record<SeoIssueKind, string> = {
  'missing-title': 'Missing title',
  'missing-description': 'Missing description',
  'title-too-long': 'Title too long',
  'description-too-long': 'Description too long',
  'duplicate-title': 'Duplicate title',
  'duplicate-description': 'Duplicate description',
  'missing-og-image': 'No share image',
  noindex: 'Hidden from search',
  'missing-alt-text': 'Image without alt text',
  'missing-transcript': 'Video without transcript',
  'orphan-page': 'Nothing links to it',
  'redirect-loop': 'Redirect chain or loop',
  'redirect-hides-page': 'Redirect hides a live page',
};

/** An error costs more than a warning; a page with neither scores 100. */
export function seoScore(issues: SeoIssue[], pages: number): number {
  if (pages <= 0) return 100;
  const weight = issues.reduce((sum, i) => sum + (i.severity === 'error' ? 3 : 1), 0);
  return Math.max(0, Math.min(100, Math.round(100 - (weight / (pages * 3)) * 100)));
}

// ─── Derivation ──────────────────────────────────────────────────────────

/** "Unit 302" → "unit-302". Also what a slug field accepts. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

/** A path is stored and compared without a trailing slash, always leading. */
export function normalisePath(path: string): string {
  const trimmed = path.trim().split('#')[0] ?? '';
  if (!trimmed) return '/';
  const withSlash = trimmed.startsWith('/') || trimmed.startsWith('http') ? trimmed : `/${trimmed}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : '/';
}

/** A filename search engines can read: "IMG_4839.jpg" → "almasi-penthouse-living-room.jpg". */
export function seoFilename(description: string, extension: string): string {
  const base = slugify(description) || 'image';
  const ext = extension.replace(/^\.+/, '').toLowerCase() || 'jpg';
  return `${base}.${ext}`;
}

/** Cut a description to what a search result actually shows, on a word. */
export function clampDescription(text: string, max = 170): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : cut.length).trimEnd()}…`;
}
