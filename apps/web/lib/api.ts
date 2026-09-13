/**
 * Server-side API client. §6.7 — the build fails rather than shipping a page
 * with no inventory, but a revalidate-time failure serves the last good render.
 *
 * D-33 — the admin database is the source of truth. Everything a visitor reads
 * about the property arrives through these calls; nothing here is a fixture.
 */
import { SITE_TAGS, type Orientation, type SiteTag, type UnitStatus } from '@avida/types';

// On the single VPS the server reaches the API over the private network
// (API_INTERNAL_URL); browsers always use the public NEXT_PUBLIC_API_URL.
const API_URL =
  process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export const DEVELOPMENT_SLUG = process.env.NEXT_PUBLIC_DEVELOPMENT_SLUG ?? 'almasi-residences';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * §3.1 — every read carries cache tags: `site` plus what it depends on. An
 * admin change names the tags it touched (SCOPE_TAGS in @avida/types) and the
 * API delivers them to /api/revalidate, retrying until they land. The time
 * window is the backstop, not the mechanism.
 */
async function get<T>(path: string, tags: SiteTag[], revalidateSeconds = 3600): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    next: { revalidate: revalidateSeconds, tags: [SITE_TAGS.site, ...tags] },
  });
  if (!res.ok) throw new ApiError(`GET ${path} failed with ${res.status}`, res.status);
  return (await res.json()) as T;
}

export async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T & { detail?: string };
  if (!res.ok) throw new ApiError(json.detail ?? `POST ${path} failed`, res.status);
  return json;
}

// ─── DTOs ────────────────────────────────────────────────────────────────

export interface MediaAssetDto {
  id: string;
  timeState: 'DAWN' | 'DAY' | 'DUSK' | 'NIGHT';
  originalKey: string;
  width: number;
  height: number;
  altText: string | null;
  dominantHex: string | null;
}

export interface MediaSetDto {
  id: string;
  key: string;
  label: string;
  kind: string;
  /** §6.2 — keyed by time state, so one state change resolves every image. */
  assets: Partial<Record<MediaAssetDto['timeState'], MediaAssetDto>>;
}

/** A file from the admin's media library, as the public API describes it. */
export interface PublicMediaDto {
  id: string;
  kind: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'MODEL';
  category: string;
  title: string | null;
  caption: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
  /** API-relative (`/api/v1/files/…`, same-origin through the rewrite) or absolute (R2). */
  url: string;
  thumbUrl: string;
  srcSet: string | null;
  blurDataUrl: string | null;
  mimeType: string;
  /** §49 — PHOTOGRAPH, SUPPLIED_RENDER, CONCEPT_RENDER or DRAWING. */
  provenance?: string;
  /** The note printed beside it: "Artist's impression." — empty for a photograph. */
  note?: string;
  /** CSS object-position from the admin's focal point. */
  focus?: string | null;
}

/** A placement on the site: a still, and optionally a film that plays over it. */
export interface SlotMediaDto {
  image: PublicMediaDto | null;
  video: PublicMediaDto | null;
}

export type MediaSlotsDto = Record<string, SlotMediaDto>;

export interface TourStationDto {
  key: string;
  title: string;
  place: string | null;
  body: string | null;
  level: string | null;
  image: PublicMediaDto | null;
  video: PublicMediaDto | null;
}

export interface WalkthroughDto {
  slug: string;
  name: string;
  description: string | null;
  stations: TourStationDto[];
}

export interface FilmDto {
  key: string;
  label: string;
  description: string | null;
  durationSec: number;
  video: PublicMediaDto;
  poster: PublicMediaDto | null;
  chapters: { startSec: number; label: string; place: string | null }[];
}

export interface SeoDto {
  site: { title: string; description: string; keywords: string[] } | null;
  pages: Record<string, { title: string | null; description: string | null; noindex: boolean; ogImage: PublicMediaDto | null }>;
}

export interface TypologyCardDto {
  slug: string;
  name: string;
  bedrooms: number;
  isPenthouse: boolean;
  summary: string | null;
  cover: PublicMediaDto | null;
}

export interface TypologyDto {
  id: string;
  slug: string;
  name: string;
  bedrooms: number;
  bathrooms: number;
  areaSqmMin: number;
  areaSqmMax: number;
  descriptionMd: string | null;
  isPenthouse?: boolean;
  floorPlanSvgUrl: string | null;
  summary: { total: number; available: number; priceMinorFrom: number | null };
  mediaSets?: MediaSetDto[];
}

export interface MilestoneDto {
  id: string;
  sortOrder: number;
  label: string;
  percent: number;
  triggerType: string;
  triggerDate: string | null;
  triggerNote: string | null;
}

export interface LandmarkDto {
  id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  distanceM: number | null;
  driveMinutes: number | null;
  walkMinutes: number | null;
}

export interface ContactDto {
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  officeAddress: string | null;
  officeHours: string | null;
  socials: Record<string, string>;
}

export interface AmenitySummaryDto {
  id: string;
  slug: string | null;
  name: string;
  shortDescription: string | null;
  descriptionMd: string | null;
  iconKey: string | null;
  location: string | null;
}

export interface DevelopmentDto {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  descriptionMd: string;
  city: string;
  country: string;
  currency: string;
  handoverDate: string | null;
  latitude: number;
  longitude: number;
  // Added by the admin platform; optional so older payloads and fixtures still type-check.
  buildingConfig?: string | null;
  developerName?: string | null;
  architect?: string | null;
  contractor?: string | null;
  contact?: ContactDto;
  typologies: TypologyDto[];
  amenities: AmenitySummaryDto[];
  landmarks: LandmarkDto[];
  milestones: MilestoneDto[];
  faqs: { id: string; question: string; answerMd: string; category?: string }[];
  seo: { title: string; description: string; keywords: string[] } | null;
  mediaSets: MediaSetDto[];
  summary: {
    total: number;
    byStatus: Record<string, number>;
    available: number;
    percentSold: number;
    priceMinorMin: number | null;
    priceMinorMax: number | null;
  };
}

export interface StackUnitDto {
  id: string;
  code: string;
  status: UnitStatus;
  /** The price a buyer pays today (promotion or discount applied). */
  priceMinor: number;
  /** The list price, when a promotion or discount is running. */
  listPriceMinor?: number | null;
  currency: string;
  areaSqm: number;
  bedrooms?: number;
  bathrooms?: number;
  featured?: boolean;
  orientation: Orientation;
  viewTags: string[];
  positionIndex: number;
  widthRatio: number;
  /** Maps the unit to a named volume in the building model (3D selector). */
  meshName?: string | null;
  /** The maquette volume chosen in the admin (@avida/types resolveModelSlot). */
  modelSlot?: string | null;
  typology: { slug: string; name: string; bedrooms: number; isPenthouse?: boolean };
}

/** §5.3 — the status-only delta the client polls; never cached. */
export interface LiveInventoryDto {
  units: { id: string; status: UnitStatus; priceMinor: number }[];
  generatedAt: string;
}

/**
 * Browser-side path. next.config rewrites /api/v1/* to the API, so client
 * fetches are same-origin and never carry the API host.
 */
export const livePath = (slug: string = DEVELOPMENT_SLUG) =>
  `/api/v1/inventory/live?development=${encodeURIComponent(slug)}`;

export interface StackFloorDto {
  id: string;
  level: number;
  label: string;
  displayName?: string | null;
  heightM: number;
  units: StackUnitDto[];
}

export interface InventoryDto {
  slug: string;
  currency: string;
  buildings: { id: string; name: string; floorCount: number; floors: StackFloorDto[] }[];
  summary: DevelopmentDto['summary'];
  generatedAt: string;
}

export interface ScheduleRowDto {
  milestoneId: string;
  sortOrder: number;
  label: string;
  percent: number;
  amountMinor: number;
  dueDate: string | null;
  triggerType: string;
  triggerNote: string | null;
}

export interface UnitDetailDto extends StackUnitDto {
  balconySqm: number | null;
  terraceSqm?: number | null;
  interiorSqm?: number | null;
  floor: { level: number; label: string; heightM: number };
  typology: StackUnitDto['typology'] & {
    id: string;
    bathrooms: number;
    floorPlanSvgUrl: string | null;
    tours: { slug: string; startSceneId: string | null }[];
  };
  schedule: {
    unitCode: string;
    totalMinor: number;
    currency: string;
    rows: ScheduleRowDto[];
    cumulative: number[];
  };
}

/** A residence as the public residence endpoint describes it (§22). */
export interface PublicResidenceDto {
  id: string;
  code: string;
  label: string;
  slug: string;
  floor: { id: string; level: number; label: string };
  type: { id: string; slug: string; name: string; isPenthouse: boolean; description: string | null };
  bedrooms: number;
  bathrooms: number;
  areaSqm: number;
  interiorSqm: number | null;
  balconySqm: number | null;
  terraceSqm: number | null;
  status: 'available' | 'reserved' | 'sold' | 'unavailable';
  priceMinor: number | null;
  listPriceMinor: number | null;
  currency: string;
  featured: boolean;
  shortDescription: string | null;
  description: string | null;
  parkingIncluded: number;
  hasStorage: boolean;
  cover: PublicMediaDto | null;
  images: PublicMediaDto[];
  videos: PublicMediaDto[];
  floorPlans: PublicMediaDto[];
  features: { name: string; category: string; iconKey: string | null }[];
  rooms: {
    id: string;
    name: string;
    type: string;
    areaSqm: number | null;
    description: string | null;
    /** Position and size on the residence plan, in plan units; null when not drawn. */
    planX?: number | null;
    planY?: number | null;
    planW?: number | null;
    planH?: number | null;
    planOpen?: boolean;
  }[];
  /** §5.4 — the specification, from the admin; type rows replace development rows. */
  specifications?: { category: string; label: string; value: string }[];
}

export interface PublicAmenityDto {
  id: string;
  slug: string | null;
  name: string;
  shortDescription: string | null;
  descriptionMd: string | null;
  iconKey: string | null;
  location: string | null;
  specifications: { label: string; value: string }[];
  images: PublicMediaDto[];
  videos: PublicMediaDto[];
}

export interface PublicGalleryDto {
  slug: string;
  title: string;
  description: string | null;
  cover: PublicMediaDto | null;
  items: PublicMediaDto[];
}

/** Page copy from the CMS, keyed by page then field (§21). Any key may be absent. */
export type PagesDto = Record<string, Record<string, unknown>>;

// ─── Reads ───────────────────────────────────────────────────────────────

export const getDevelopment = (slug: string = DEVELOPMENT_SLUG) =>
  get<DevelopmentDto>(`/development/${slug}`, ['development', 'content', 'inventory']);

export const getInventory = (slug: string = DEVELOPMENT_SLUG) =>
  get<InventoryDto>(`/development/${slug}/inventory`, ['inventory'], 60);

export const getTypologies = (slug: string = DEVELOPMENT_SLUG) =>
  get<TypologyDto[]>(`/typology/${slug}`, ['inventory']);

export const getTypology = (typoSlug: string, slug: string = DEVELOPMENT_SLUG) =>
  get<TypologyDto & { units: StackUnitDto[]; mediaSets: MediaSetDto[] }>(`/typology/${slug}/${typoSlug}`, ['inventory']);

export const getUnit = (id: string) => get<UnitDetailDto>(`/unit/${id}`, ['inventory'], 60);

export const getPublicResidence = (code: string) =>
  get<PublicResidenceDto>(`/residences/${encodeURIComponent(code)}`, ['inventory', 'media', 'content'], 60);

/** §52 — the site's placements. An empty one renders a neutral frame, never a substitute. */
export const getMediaSlots = () => get<MediaSlotsDto>('/media-slots', ['presentation', 'media']);
export const getMediaSlotsSafe = () => getMediaSlots().catch((): MediaSlotsDto => ({}));
export const getWalkthrough = (slug: string) => get<WalkthroughDto>(`/tours/${encodeURIComponent(slug)}`, ['presentation', 'media']);
export const getFilm = () => get<FilmDto>('/film', ['presentation', 'media']);
export const getSeo = () => get<SeoDto>('/seo', ['seo', 'media']);
export const getTypologyCards = () => get<TypologyCardDto[]>('/typology-cards', ['inventory', 'media']);

/** A residence card: what the featured section and residence lists need. */
export type PublicResidenceCardDto = Pick<
  PublicResidenceDto,
  'id' | 'code' | 'label' | 'slug' | 'floor' | 'bedrooms' | 'bathrooms' | 'areaSqm' | 'status' | 'priceMinor' | 'currency' | 'featured' | 'shortDescription' | 'cover'
> & { type: { id: string; slug: string; name: string; isPenthouse: boolean } };

/** §48 — residences the admin marked as featured. Never a list in code. */
export const getFeatured = () => get<PublicResidenceCardDto[]>('/residences/featured', ['inventory', 'media'], 60);
export const getAmenities = () => get<PublicAmenityDto[]>('/amenities', ['content', 'media']);
export const getGalleries = () => get<PublicGalleryDto[]>('/galleries', ['media']);
export const getPages = () => get<PagesDto>('/pages', ['content']);

/** CMS copy never blocks a page: an unreachable CMS renders the page without its words. */
export async function getPagesSafe(): Promise<PagesDto> {
  return getPages().catch(() => ({}));
}

/**
 * A string field from the CMS, or '' when the admin left it empty.
 *
 * Roadmap item 26: there is no fallback prose in code any more. A sentence the
 * site used to print from its own source could contradict what the admin
 * wrote; an empty key now renders nothing, and the words live in one place.
 */
export function copy(pages: PagesDto, page: string, key: string): string {
  const v = pages[page]?.[key];
  return typeof v === 'string' ? v.trim() : '';
}

/** A CMS title written with "|" for its line break, as [first, second]. */
export function copyLines(pages: PagesDto, page: string, key: string): string[] {
  return copy(pages, page, key)
    .split('|')
    .map((l) => l.trim())
    .filter(Boolean);
}

export interface ProgressUpdateDto {
  id: string;
  capturedOn: string;
  title: string;
  bodyMd: string | null;
  percentComplete: number | null;
  splatUrl: string | null;
}

export const getProgress = (slug: string = DEVELOPMENT_SLUG) =>
  get<ProgressUpdateDto[]>(`/development/${slug}/progress`, ['content']);

export interface TourSceneDto {
  id: string;
  key: string;
  label: string;
  yawDeg: number;
  pitchDeg: number;
  fovDeg: number;
  planX: number | null;
  planY: number | null;
  panoramas: Record<string, { previewKey: string; originalKey: string }>;
  hotspots: {
    id: string;
    kind: string;
    yawDeg: number;
    pitchDeg: number;
    label: string | null;
    targetSceneId: string | null;
    targetScene: { id: string; key: string; label: string } | null;
  }[];
}

export interface TourDto {
  id: string;
  slug: string;
  name: string;
  startSceneId: string | null;
  typology: { slug: string; name: string; floorPlanSvgUrl: string | null } | null;
  scenes: TourSceneDto[];
}

export const getTour = (tourSlug: string, slug: string = DEVELOPMENT_SLUG) =>
  get<TourDto>(`/tour/${slug}/${tourSlug}`, ['presentation']);
