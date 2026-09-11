/**
 * Server-side API client. §6.7 — the build fails rather than shipping a page
 * with no inventory, but a revalidate-time failure serves the last good render.
 */
import type { Orientation, UnitStatus } from '@avida/types';

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

async function get<T>(path: string, revalidateSeconds = 3600): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1${path}`, { next: { revalidate: revalidateSeconds } });
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

export interface TypologyDto {
  id: string;
  slug: string;
  name: string;
  bedrooms: number;
  bathrooms: number;
  areaSqmMin: number;
  areaSqmMax: number;
  descriptionMd: string | null;
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
  typologies: TypologyDto[];
  amenities: { id: string; name: string; descriptionMd: string | null; iconKey: string | null }[];
  landmarks: LandmarkDto[];
  milestones: MilestoneDto[];
  faqs: { id: string; question: string; answerMd: string }[];
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
  priceMinor: number;
  currency: string;
  areaSqm: number;
  orientation: Orientation;
  viewTags: string[];
  positionIndex: number;
  widthRatio: number;
  /** Maps the unit to a named volume in the building model (3D selector). */
  meshName?: string | null;
  typology: { slug: string; name: string; bedrooms: number };
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
  notes: string | null;
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

// ─── Reads ───────────────────────────────────────────────────────────────

export const getDevelopment = (slug: string = DEVELOPMENT_SLUG) =>
  get<DevelopmentDto>(`/development/${slug}`);

export const getInventory = (slug: string = DEVELOPMENT_SLUG) =>
  get<InventoryDto>(`/development/${slug}/inventory`, 60);

export const getTypologies = (slug: string = DEVELOPMENT_SLUG) =>
  get<TypologyDto[]>(`/typology/${slug}`);

export const getTypology = (typoSlug: string, slug: string = DEVELOPMENT_SLUG) =>
  get<TypologyDto & { units: StackUnitDto[]; mediaSets: MediaSetDto[] }>(
    `/typology/${slug}/${typoSlug}`,
  );

export const getUnit = (id: string) => get<UnitDetailDto>(`/unit/${id}`, 60);

export interface ProgressUpdateDto {
  id: string;
  capturedOn: string;
  title: string;
  bodyMd: string | null;
  percentComplete: number | null;
  splatUrl: string | null;
}

export const getProgress = (slug: string = DEVELOPMENT_SLUG) =>
  get<ProgressUpdateDto[]>(`/development/${slug}/progress`);

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
  get<TourDto>(`/tour/${slug}/${tourSlug}`);
