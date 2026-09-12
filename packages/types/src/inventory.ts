/** §5.5 — residence status rules. Encoded here, enforced by the API, never by the UI. */

export const UNIT_STATUSES = [
  'AVAILABLE',
  'RESERVED',
  'ON_HOLD',
  'SOLD',
  'OCCUPIED',
  'UNAVAILABLE',
] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export const ORIENTATIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

/** A residence that has changed hands. Leaving this set undoes a sale. */
const CLOSED: ReadonlySet<UnitStatus> = new Set(['SOLD', 'OCCUPIED']);

/**
 * D-34 — the sales team moves a residence between the open statuses freely
 * (availability changes daily; a rigid pipeline made the admin fight them).
 * The one guarded edge is undoing a sale: SOLD or OCCUPIED back to an open
 * status needs the `residence.reverse-sale` permission, so a sold home cannot
 * become available by accident. SOLD ↔ OCCUPIED is a move-in/out, not a reversal.
 */
export function isSaleReversal(from: UnitStatus, to: UnitStatus): boolean {
  return CLOSED.has(from) && !CLOSED.has(to);
}

export function allowedTransitions(from: UnitStatus, canReverseSale = false): UnitStatus[] {
  return UNIT_STATUSES.filter((to) => to !== from && (canReverseSale || !isSaleReversal(from, to)));
}

export function canTransition(from: UnitStatus, to: UnitStatus, canReverseSale = false): boolean {
  return from === to || allowedTransitions(from, canReverseSale).includes(to);
}

/** Statuses a visitor can act on. Everything else is shown but not sellable. */
export function isSellable(status: UnitStatus): boolean {
  return status === 'AVAILABLE';
}

/** §2.5 — status is shown by fill treatment as well as hue, so it survives colour-blindness. */
export type StatusFill = 'solid' | 'hatch' | 'outline' | 'faint';

export const STATUS_FILL: Record<UnitStatus, StatusFill> = {
  AVAILABLE: 'solid',
  RESERVED: 'hatch',
  ON_HOLD: 'hatch',
  SOLD: 'outline',
  OCCUPIED: 'outline',
  UNAVAILABLE: 'faint',
};

/** §2.7 — sentence case, no exclamation marks, no scarcity language. */
export const STATUS_LABEL: Record<UnitStatus, string> = {
  AVAILABLE: 'Available',
  RESERVED: 'Reserved',
  ON_HOLD: 'On hold',
  SOLD: 'Sold',
  OCCUPIED: 'Occupied',
  UNAVAILABLE: 'Unavailable',
};

/**
 * What a visitor is told. ON_HOLD is a sale being negotiated — not buyable, not
 * final — so it reads "reserved". OCCUPIED is a sold home someone lives in.
 */
export type PublicUnitStatus = 'available' | 'reserved' | 'sold' | 'unavailable';

export const PUBLIC_UNIT_STATUS: Record<UnitStatus, PublicUnitStatus> = {
  AVAILABLE: 'available',
  RESERVED: 'reserved',
  ON_HOLD: 'reserved',
  SOLD: 'sold',
  OCCUPIED: 'sold',
  UNAVAILABLE: 'unavailable',
};

export interface UnitFilterState {
  typologySlugs: string[];
  statuses: UnitStatus[];
  orientations: Orientation[];
  priceMinorMax: number | null;
}

export const EMPTY_FILTERS: UnitFilterState = {
  typologySlugs: [],
  statuses: [],
  orientations: [],
  priceMinorMax: null,
};

export interface FilterableUnit {
  status: UnitStatus;
  priceMinor: number;
  orientation: Orientation;
  typology: { slug: string };
}

/**
 * §2.5 — non-matching units are dimmed, not removed: seeing that the building
 * is mostly sold is itself persuasive. So this answers "does it match", and the
 * caller decides opacity rather than filtering the array.
 */
export function unitMatches(unit: FilterableUnit, f: UnitFilterState): boolean {
  if (f.typologySlugs.length > 0 && !f.typologySlugs.includes(unit.typology.slug)) return false;
  if (f.statuses.length > 0 && !f.statuses.includes(unit.status)) return false;
  if (f.orientations.length > 0 && !f.orientations.includes(unit.orientation)) return false;
  if (f.priceMinorMax !== null && unit.priceMinor > f.priceMinorMax) return false;
  return true;
}

export function isFilterActive(f: UnitFilterState): boolean {
  return (
    f.typologySlugs.length > 0 ||
    f.statuses.length > 0 ||
    f.orientations.length > 0 ||
    f.priceMinorMax !== null
  );
}

// ─── Pricing helpers ─────────────────────────────────────────────────────

export interface PricedUnit {
  priceMinor: number;
  discountMinor?: number | null;
  promoPriceMinor?: number | null;
  promoEndsAt?: string | Date | null;
}

/**
 * The price a buyer pays today: an unexpired promotional price wins, then the
 * list price less any discount. Never below zero.
 */
export function effectivePriceMinor(u: PricedUnit, now: Date = new Date()): number {
  const promoLive =
    u.promoPriceMinor != null && (u.promoEndsAt == null || new Date(u.promoEndsAt) > now);
  if (promoLive) return Math.max(0, u.promoPriceMinor!);
  return Math.max(0, u.priceMinor - (u.discountMinor ?? 0));
}

/** Price per m², minor units, rounded to the whole minor unit. Null for a zero area. */
export function pricePerSqmMinor(priceMinor: number, areaSqm: number): number | null {
  return areaSqm > 0 ? Math.round(priceMinor / areaSqm) : null;
}
