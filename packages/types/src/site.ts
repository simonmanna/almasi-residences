/**
 * The public site's managed presentation vocabulary (roadmap phase 1).
 *
 * Before this existed the site's art, tours, film and page metadata lived in
 * the web app's repository, and the admin's media library was only consulted
 * where a row happened to exist. Every name below is a *place* on the site; the
 * admin decides what fills it, and an empty place renders a neutral frame —
 * never a substitute image (§40.1).
 */

// ─── Media slots ─────────────────────────────────────────────────────────

export interface MediaSlotDef {
  key: string;
  label: string;
  /** Where on the site it appears, in the manager's words. */
  where: string;
  group: 'Homepage' | 'Pages' | 'Film';
  /** Whether a looping film may play over the still. */
  video: boolean;
}

export const MEDIA_SLOTS: readonly MediaSlotDef[] = [
  { key: 'home-hero', label: 'Homepage hero', where: 'The first screen of the homepage, behind the headline.', group: 'Homepage', video: true },
  { key: 'home-film-teaser', label: 'Film teaser', where: 'The full-width invitation to watch the film, lower on the homepage.', group: 'Homepage', video: true },
  { key: 'home-penthouse', label: 'Penthouse feature', where: 'Beside the list of penthouses on the homepage.', group: 'Homepage', video: true },
  { key: 'page-amenities', label: 'Amenities page header', where: 'Behind the title of the Amenities page.', group: 'Pages', video: false },
  { key: 'page-location', label: 'Location page header', where: 'Behind the title of the Location page.', group: 'Pages', video: false },
  { key: 'film-poster', label: 'Film poster', where: 'Shown on the Film page before the film starts.', group: 'Film', video: false },
] as const;

export const mediaSlotDef = (key: string) => MEDIA_SLOTS.find((s) => s.key === key);

// ─── Provenance (§49) ────────────────────────────────────────────────────

export const MEDIA_PROVENANCES = ['PHOTOGRAPH', 'SUPPLIED_RENDER', 'CONCEPT_RENDER', 'DRAWING'] as const;
export type MediaProvenanceValue = (typeof MEDIA_PROVENANCES)[number];

export const PROVENANCE_LABEL: Record<MediaProvenanceValue, string> = {
  PHOTOGRAPH: 'Photograph',
  SUPPLIED_RENDER: 'Developer’s render',
  CONCEPT_RENDER: 'Concept visual',
  DRAWING: 'Drawing or plan',
};

/**
 * The note printed beside the file on the website. A photograph needs none; a
 * computer-generated image always says so, so a render is never read as a
 * photograph of a finished apartment.
 */
export const PROVENANCE_NOTE: Record<MediaProvenanceValue, string> = {
  PHOTOGRAPH: '',
  SUPPLIED_RENDER: '',
  CONCEPT_RENDER: '',
  DRAWING: 'Indicative drawing, not to scale.',
};

export function provenanceNote(p: string | null | undefined): string {
  return p && p in PROVENANCE_NOTE ? PROVENANCE_NOTE[p as MediaProvenanceValue] : '';
}

// ─── Tours ───────────────────────────────────────────────────────────────

/** The walkthroughs the site renders. The admin edits their stations. */
export const SITE_TOURS = [
  { slug: 'building', label: 'Building walkthrough', where: '/tour' },
  { slug: 'penthouse', label: 'Penthouse walkthrough', where: '/tour/penthouse' },
  { slug: 'experience', label: 'Homepage experience', where: 'The pinned story on the homepage' },
] as const;

/** Where the homepage story's gauge can point: top of the building first. */
export const TOUR_LEVELS = [
  { key: 'sky', label: 'Above' },
  { key: 'R', label: 'Roof' },
  { key: '4', label: 'Level 4' },
  { key: '3', label: 'Level 3' },
  { key: '2', label: 'Level 2' },
  { key: '1', label: 'Level 1' },
  { key: 'G', label: 'Ground' },
  { key: 'street', label: 'Street' },
] as const;
export type TourLevelKey = (typeof TOUR_LEVELS)[number]['key'];

// ─── SEO (§5.6) ──────────────────────────────────────────────────────────

export interface SeoRoute {
  path: string;
  label: string;
  /**
   * What the page is called when the admin has written no title — the website
   * prints it and the SEO audit judges it. The homepage has none: its title is
   * the site-wide one.
   */
  title?: string;
  /** Only where the page ships its own; otherwise the site-wide description stands in. */
  description?: string;
}

/** Every public route whose metadata the admin owns. */
export const SEO_ROUTES: readonly SeoRoute[] = [
  { path: '/', label: 'Homepage' },
  {
    path: '/residences',
    label: 'Residences',
    title: 'Residences',
    description: 'Every home at Almasi, Kimihurura: {total} one-bedroom, two-bedroom and penthouse residences, with live availability, floor plans and prices.',
  },
  {
    path: '/amenities',
    label: 'Amenities',
    title: 'Amenities',
    description: 'Life at Almasi: a pool, gym, sauna and massage, co-working, a residents’ meeting room, gardens and basement parking, all within the building in Kimihurura.',
  },
  {
    path: '/location',
    label: 'Location',
    title: 'Location',
    description: 'Almasi sits in Kimihurura, Kigali: minutes from the city centre, embassies, schools, restaurants and the convention centre. See it on the map.',
  },
  {
    path: '/gallery',
    label: 'Gallery',
    title: 'Gallery',
    description: 'Photographs and renders of Almasi: the facade, pool, reception, and furnished one-bedroom, two-bedroom and penthouse interiors in Kimihurura, Kigali.',
  },
  {
    path: '/3d-design',
    label: '3D design',
    title: '3D Design | Explore Almasi',
    description: 'Step inside Almasi in Kimihurura, Kigali. Explore the architecture, pool, reception and furnished one-bedroom, two-bedroom and penthouse homes in interactive 3D.',
  },
  {
    path: '/buying',
    label: 'Buying',
    title: 'Buying',
    description: 'How to buy a home at Almasi: reserve, sign and pay in stages through a clear payment plan, with what each step costs and when it falls due.',
  },
  { path: '/progress', label: 'Construction progress', title: 'Construction progress' },
  { path: '/film', label: 'Film', title: 'The film' },
  { path: '/tour', label: 'Building tour', title: 'The 3D tour' },
  { path: '/tour/penthouse', label: 'Penthouse tour', title: 'The penthouse tour' },
  { path: '/locations', label: 'Neighbourhoods', title: 'Locations' },
  { path: '/insights', label: 'Insights', title: 'Insights' },
  { path: '/enquire', label: 'Enquire', title: 'Enquire or book a viewing' },
];

export const seoRoute = (path: string): SeoRoute | undefined => SEO_ROUTES.find((r) => r.path === path);

export const SEO_TITLE_MAX = 70;
export const SEO_DESCRIPTION_MAX = 170;

// ─── Live copy tokens ────────────────────────────────────────────────────

/**
 * Copy the admin writes may name live figures in braces — "{penthouse.count}
 * penthouses from {penthouse.areaMin} m²" — so a sentence never goes stale when
 * a residence is added. A token with no value is removed with the space before
 * it rather than printed as a brace.
 */
export function fillCopyTokens(text: string, values: Record<string, string | number | null | undefined>): string {
  return text
    .replace(/\s?\{([\w.-]+)\}/g, (match, key: string) => {
      const v = values[key];
      if (v === null || v === undefined || v === '') return '';
      return match.startsWith(' ') ? ` ${v}` : String(v);
    })
    .trim();
}

export const COPY_TOKEN_HELP =
  'Live figures you can write in braces: {total}, {available}, {types} (“Four”), {handover} (“Q2 2028”), and per type — one-bedroom, two-bedroom, three-bedroom, penthouse — .count, .countWords, .available, .areaMin, .areaMax, e.g. {penthouse.areaMin}.';

// ─── Cache tags (§3.1) ───────────────────────────────────────────────────

/**
 * The website tags every API read with what it depends on; the API names the
 * tags a change touches. Tag-based rather than path-based: a page that reads
 * the data is refreshed whether or not anyone remembered to list its path.
 */
export const SITE_TAGS = {
  /** Every read. Revalidating it refreshes the whole site. */
  site: 'site',
  inventory: 'inventory',
  development: 'development',
  content: 'content',
  media: 'media',
  presentation: 'presentation',
  seo: 'seo',
} as const;
export type SiteTag = (typeof SITE_TAGS)[keyof typeof SITE_TAGS];

export type SyncScope = 'inventory' | 'content' | 'media' | 'presentation' | 'seo' | 'all';

/** Which tags an admin change of each kind invalidates. */
export const SCOPE_TAGS: Record<SyncScope, SiteTag[]> = {
  inventory: ['inventory', 'development'],
  content: ['content', 'development', 'inventory'],
  media: ['media', 'presentation', 'content', 'inventory'],
  presentation: ['presentation'],
  seo: ['seo'],
  all: ['site'],
};
