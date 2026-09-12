/**
 * The residence model the public site renders.
 *
 * Every availability figure on the site — the 3D building, the floor selector,
 * the explorer, a residence page, the counts in the introduction — is derived
 * here from ONE payload: the API's inventory stack. Nothing below stores a
 * status or a count; it only reshapes what the API said, so no two parts of the
 * page can disagree about a residence.
 */
import { PUBLIC_UNIT_STATUS, type Orientation, type PublicUnitStatus, type UnitStatus } from '@avida/types';
import type { InventoryDto } from './api';

/**
 * How the site groups residences for a visitor. Derived from the residence's
 * bedrooms and whether its type is a penthouse — never from a list of type
 * names — so a type the developer adds in the admin lands in the right group.
 */
export type ResidenceType = 'one-bedroom' | 'two-bedroom' | 'three-bedroom' | 'penthouse';
export type PublicStatus = PublicUnitStatus;

export const RESIDENCE_TYPES: readonly ResidenceType[] = ['one-bedroom', 'two-bedroom', 'three-bedroom', 'penthouse'];
export const PUBLIC_STATUSES: readonly PublicStatus[] = ['available', 'reserved', 'sold', 'unavailable'];

/** ON_HOLD reads "reserved"; OCCUPIED reads "sold"; UNAVAILABLE is held back by the developer. */
export const PUBLIC_STATUS: Record<UnitStatus, PublicStatus> = PUBLIC_UNIT_STATUS;

export const STATUS_TEXT: Record<PublicStatus, string> = {
  available: 'Available',
  reserved: 'Reserved',
  sold: 'Sold',
  unavailable: 'Unavailable',
};

export const TYPE_TEXT: Record<ResidenceType, string> = {
  'one-bedroom': 'One bedroom',
  'two-bedroom': 'Two bedroom',
  'three-bedroom': 'Three bedroom',
  penthouse: 'Penthouse',
};

export const ORIENTATION_TEXT: Record<Orientation, string> = {
  N: 'North',
  NE: 'North-east',
  E: 'East',
  SE: 'South-east',
  S: 'South',
  SW: 'South-west',
  W: 'West',
  NW: 'North-west',
};

/** `['city', 'hills']` → "City and hills". */
export function viewText(tags: readonly string[]): string {
  const words = tags.map((t) => t.toLowerCase());
  if (words.length === 0) return '';
  const first = words[0]!.charAt(0).toUpperCase() + words[0]!.slice(1);
  if (words.length === 1) return first;
  return `${[first, ...words.slice(1, -1)].join(', ')} and ${words.at(-1)}`;
}

export interface Residence {
  id: string;
  /** As stored: `C2`, `PH-A`. */
  code: string;
  /** As read: `C2`, `PH A`. */
  label: string;
  /** URL segment: `c2`, `ph-a`. */
  slug: string;
  floorLevel: number;
  floorLabel: string;
  type: ResidenceType;
  typologySlug: string;
  typologyName: string;
  bedrooms: number;
  bathrooms: number | null;
  areaSqm: number;
  priceMinor: number;
  currency: string;
  status: UnitStatus;
  publicStatus: PublicStatus;
  orientation: Orientation;
  viewTags: string[];
  positionIndex: number;
  meshName: string | null;
  featured: boolean;
}

export function residenceType(isPenthouse: boolean, bedrooms: number): ResidenceType {
  if (isPenthouse) return 'penthouse';
  if (bedrooms <= 1) return 'one-bedroom';
  return bedrooms === 2 ? 'two-bedroom' : 'three-bedroom';
}

export function displayCode(code: string): string {
  return code.replace(/-/g, ' ');
}

export function residenceSlug(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/** Short floor mark for selectors and the level gauge: B, G, 1, 2, 3, PH. */
export function floorMark(level: number, label: string): string {
  if (level < 0) return 'B';
  if (level === 0) return 'G';
  if (/penthouse/i.test(label)) return 'PH';
  return String(level);
}

type FloorLike = InventoryDto['buildings'][number]['floors'][number];
type UnitLike = FloorLike['units'][number];

const isPenthouseUnit = (u: UnitLike) => u.typology.isPenthouse ?? u.typology.slug.startsWith('penthouse');

/** The floor that holds the penthouses is read as such, whatever number the schedule gives it. */
function isPenthouseFloor(floor: FloorLike): boolean {
  return floor.units.length > 0 && floor.units.every(isPenthouseUnit);
}

function floorDisplayLabel(floor: FloorLike): string {
  if (floor.displayName) return floor.displayName;
  return isPenthouseFloor(floor) ? 'Penthouse level' : floor.label;
}

export function toResidences(
  inventory: InventoryDto,
  bathroomsByTypology: Readonly<Record<string, number>> = {},
): Residence[] {
  const list: Residence[] = [];
  for (const building of inventory.buildings) {
    for (const floor of building.floors) {
      const floorLabel = floorDisplayLabel(floor);
      for (const u of floor.units) {
        const bedrooms = u.bedrooms ?? u.typology.bedrooms;
        list.push({
          id: u.id,
          code: u.code,
          label: displayCode(u.code),
          slug: residenceSlug(u.code),
          floorLevel: floor.level,
          floorLabel,
          type: residenceType(isPenthouseUnit(u), bedrooms),
          typologySlug: u.typology.slug,
          typologyName: u.typology.name,
          bedrooms,
          bathrooms: u.bathrooms ?? bathroomsByTypology[u.typology.slug] ?? null,
          areaSqm: u.areaSqm,
          priceMinor: u.priceMinor,
          currency: u.currency,
          status: u.status,
          publicStatus: PUBLIC_STATUS[u.status] ?? 'unavailable',
          orientation: u.orientation,
          viewTags: u.viewTags,
          positionIndex: u.positionIndex,
          meshName: u.meshName ?? null,
          featured: u.featured ?? false,
        });
      }
    }
  }
  return list.sort((a, b) => a.floorLevel - b.floorLevel || a.positionIndex - b.positionIndex);
}

/** §13 — a price is only published for something a visitor can actually buy. */
export function visiblePriceMinor(r: Pick<Residence, 'publicStatus' | 'priceMinor'>): number | null {
  return r.publicStatus === 'available' ? r.priceMinor : null;
}

export function findResidence(residences: readonly Residence[], slug: string): Residence | undefined {
  const s = slug.toLowerCase();
  return residences.find((r) => r.slug === s);
}

// ─── Live deltas ─────────────────────────────────────────────────────────

export interface LiveUnit {
  id: string;
  status: UnitStatus;
  priceMinor: number;
}

/** Folds the API's status-only delta into the stack. Returns the same object when nothing changed. */
export function applyLive(inventory: InventoryDto, live: readonly LiveUnit[]): InventoryDto {
  const byId = new Map(live.map((u) => [u.id, u]));
  let changed = false;
  const buildings = inventory.buildings.map((b) => ({
    ...b,
    floors: b.floors.map((f) => ({
      ...f,
      units: f.units.map((u) => {
        const next = byId.get(u.id);
        if (!next || (next.status === u.status && next.priceMinor === u.priceMinor)) return u;
        changed = true;
        return { ...u, status: next.status, priceMinor: next.priceMinor };
      }),
    })),
  }));
  return changed ? { ...inventory, buildings } : inventory;
}

// ─── Derived counts ──────────────────────────────────────────────────────

export interface TypeSummary {
  total: number;
  available: number;
  areaMin: number;
  areaMax: number;
  priceFromMinor: number | null;
}

export interface ResidenceSummary {
  total: number;
  available: number;
  byStatus: Record<PublicStatus, number>;
  byType: Record<ResidenceType, TypeSummary>;
}

export function summarise(residences: readonly Residence[]): ResidenceSummary {
  const byStatus: Record<PublicStatus, number> = { available: 0, reserved: 0, sold: 0, unavailable: 0 };
  const byType = Object.fromEntries(
    RESIDENCE_TYPES.map((t) => [
      t,
      { total: 0, available: 0, areaMin: Number.POSITIVE_INFINITY, areaMax: 0, priceFromMinor: null },
    ]),
  ) as Record<ResidenceType, TypeSummary>;

  for (const r of residences) {
    byStatus[r.publicStatus] += 1;
    const t = byType[r.type];
    t.total += 1;
    t.areaMin = Math.min(t.areaMin, r.areaSqm);
    t.areaMax = Math.max(t.areaMax, r.areaSqm);
    if (r.publicStatus === 'available') {
      t.available += 1;
      t.priceFromMinor = t.priceFromMinor === null ? r.priceMinor : Math.min(t.priceFromMinor, r.priceMinor);
    }
  }
  for (const t of Object.values(byType)) if (t.total === 0) t.areaMin = 0;

  return { total: residences.length, available: byStatus.available, byStatus, byType };
}

/** The groups that actually have residences, in display order. */
export function typesPresent(summary: ResidenceSummary): ResidenceType[] {
  return RESIDENCE_TYPES.filter((t) => summary.byType[t].total > 0);
}

export interface FloorSummary {
  level: number;
  label: string;
  mark: string;
  total: number;
  available: number;
}

/**
 * Every floor of the building, top first — including the basement, which sells
 * nothing. An empty floor above ground (a roof level in the schedule) is left out.
 */
export function floorsOf(inventory: InventoryDto, residences: readonly Residence[]): FloorSummary[] {
  const floors = inventory.buildings.flatMap((b) => b.floors).filter((f) => f.level < 0 || f.units.length > 0);
  return floors
    .map((f) => {
      const here = residences.filter((r) => r.floorLevel === f.level);
      const label = floorDisplayLabel(f);
      return {
        level: f.level,
        label,
        mark: floorMark(f.level, label),
        total: here.length,
        available: here.filter((r) => r.publicStatus === 'available').length,
      };
    })
    .sort((a, b) => b.level - a.level);
}

// ─── Filters ─────────────────────────────────────────────────────────────

export const SIZE_BANDS = [
  { id: 'under-80', label: 'Under 80 m²', min: 0, max: 80 },
  { id: '80-120', label: '80 to 120 m²', min: 80, max: 120 },
  { id: '120-200', label: '120 to 200 m²', min: 120, max: 200 },
  { id: 'over-200', label: '200 m² and over', min: 200, max: Number.POSITIVE_INFINITY },
] as const;
export type SizeBandId = (typeof SIZE_BANDS)[number]['id'];

export interface ResidenceFilter {
  types: ResidenceType[];
  bedrooms: number[];
  floors: number[];
  sizes: SizeBandId[];
  statuses: PublicStatus[];
  maxPriceMinor: number | null;
}

export const EMPTY_FILTER: ResidenceFilter = {
  types: [],
  bedrooms: [],
  floors: [],
  sizes: [],
  statuses: [],
  maxPriceMinor: null,
};

export function matchesFilter(r: Residence, f: ResidenceFilter): boolean {
  if (f.types.length > 0 && !f.types.includes(r.type)) return false;
  if (f.bedrooms.length > 0 && !f.bedrooms.includes(r.bedrooms)) return false;
  if (f.floors.length > 0 && !f.floors.includes(r.floorLevel)) return false;
  if (
    f.sizes.length > 0 &&
    !f.sizes.some((id) => {
      const band = SIZE_BANDS.find((b) => b.id === id);
      return band !== undefined && r.areaSqm >= band.min && r.areaSqm < band.max;
    })
  ) {
    return false;
  }
  if (f.statuses.length > 0 && !f.statuses.includes(r.publicStatus)) return false;
  if (f.maxPriceMinor !== null) {
    // A price cap can only be met by a residence that has a public price.
    const price = visiblePriceMinor(r);
    if (price === null || price > f.maxPriceMinor) return false;
  }
  return true;
}

export function isFiltering(f: ResidenceFilter): boolean {
  return (
    f.types.length > 0 ||
    f.bedrooms.length > 0 ||
    f.floors.length > 0 ||
    f.sizes.length > 0 ||
    f.statuses.length > 0 ||
    f.maxPriceMinor !== null
  );
}

export type SortKey = 'floor' | 'size-asc' | 'size-desc' | 'price-asc' | 'price-desc';

export const SORT_TEXT: Record<SortKey, string> = {
  floor: 'Floor, lowest first',
  'size-asc': 'Size, smallest first',
  'size-desc': 'Size, largest first',
  'price-asc': 'Price, lowest first',
  'price-desc': 'Price, highest first',
};

export function sortResidences(list: readonly Residence[], key: SortKey): Residence[] {
  const copy = [...list];
  const byFloor = (a: Residence, b: Residence) =>
    a.floorLevel - b.floorLevel || a.positionIndex - b.positionIndex;
  switch (key) {
    case 'size-asc':
      return copy.sort((a, b) => a.areaSqm - b.areaSqm || byFloor(a, b));
    case 'size-desc':
      return copy.sort((a, b) => b.areaSqm - a.areaSqm || byFloor(a, b));
    case 'price-asc':
    case 'price-desc': {
      // Residences without a public price go last in either direction.
      const dir = key === 'price-asc' ? 1 : -1;
      return copy.sort((a, b) => {
        const pa = visiblePriceMinor(a);
        const pb = visiblePriceMinor(b);
        if (pa === null && pb === null) return byFloor(a, b);
        if (pa === null) return 1;
        if (pb === null) return -1;
        return (pa - pb) * dir || byFloor(a, b);
      });
    }
    default:
      return copy.sort(byFloor);
  }
}

const isType = (v: string): v is ResidenceType => (RESIDENCE_TYPES as readonly string[]).includes(v);
const isStatus = (v: string): v is PublicStatus => (PUBLIC_STATUSES as readonly string[]).includes(v);
const isSize = (v: string): v is SizeBandId => SIZE_BANDS.some((b) => b.id === v);
const isSort = (v: string | null): v is SortKey => v !== null && v in SORT_TEXT;

type SearchInput = URLSearchParams | Readonly<Record<string, string | string[] | undefined>>;

/** Filters live in the URL, so a filtered view can be shared or bookmarked. */
export function filterFromSearch(input: SearchInput): { filter: ResidenceFilter; sort: SortKey } {
  const get = (key: string): string | null => {
    if (input instanceof URLSearchParams) return input.get(key);
    const v = input[key];
    return (Array.isArray(v) ? v[0] : v) ?? null;
  };
  const list = (key: string) =>
    (get(key) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  const ints = (key: string, min: number, max: number) =>
    list(key)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= min && n <= max);

  const maxMajor = Number(get('max'));
  const sort = get('sort');
  return {
    filter: {
      types: list('type').filter(isType),
      bedrooms: ints('beds', 1, 9),
      floors: ints('floor', -1, 50),
      sizes: list('size').filter(isSize),
      statuses: list('status').filter(isStatus),
      maxPriceMinor: Number.isFinite(maxMajor) && maxMajor > 0 ? Math.round(maxMajor * 100) : null,
    },
    sort: isSort(sort) ? sort : 'floor',
  };
}

export function filterToSearch(f: ResidenceFilter, sort: SortKey = 'floor'): string {
  const p = new URLSearchParams();
  if (f.types.length) p.set('type', f.types.join(','));
  if (f.bedrooms.length) p.set('beds', f.bedrooms.join(','));
  if (f.floors.length) p.set('floor', f.floors.join(','));
  if (f.sizes.length) p.set('size', f.sizes.join(','));
  if (f.statuses.length) p.set('status', f.statuses.join(','));
  if (f.maxPriceMinor !== null) p.set('max', String(Math.round(f.maxPriceMinor / 100)));
  if (sort !== 'floor') p.set('sort', sort);
  return p.toString();
}
