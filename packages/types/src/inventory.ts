/** §5.5 — status transition rules. Encoded here, enforced by the API, never by the UI. */

export const UNIT_STATUSES = [
  'AVAILABLE',
  'RESERVED',
  'BOOKED',
  'SOLD',
  'NOT_RELEASED',
] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export const ORIENTATIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

/**
 * §5.5. SOLD is terminal for everyone except an OWNER, who may reverse a
 * mistake — that exception is enforced by the role guard, not by this map.
 */
const TRANSITIONS: Record<UnitStatus, UnitStatus[]> = {
  NOT_RELEASED: ['AVAILABLE'],
  AVAILABLE: ['RESERVED', 'NOT_RELEASED'],
  RESERVED: ['BOOKED', 'AVAILABLE'],
  BOOKED: ['SOLD', 'AVAILABLE'],
  SOLD: [],
};

export function allowedTransitions(from: UnitStatus): UnitStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: UnitStatus, to: UnitStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

/** Statuses a visitor can act on. Everything else is shown but not sellable. */
export function isSellable(status: UnitStatus): boolean {
  return status === 'AVAILABLE';
}

/** §2.5 — status is shown by fill treatment as well as hue, so it survives
 * colour-blindness and all four time states. */
export type StatusFill = 'solid' | 'hatch' | 'outline' | 'faint';

export const STATUS_FILL: Record<UnitStatus, StatusFill> = {
  AVAILABLE: 'solid',
  RESERVED: 'hatch',
  BOOKED: 'hatch',
  SOLD: 'outline',
  NOT_RELEASED: 'faint',
};

/** §2.7 — sentence case, no exclamation marks, no scarcity language. */
export const STATUS_LABEL: Record<UnitStatus, string> = {
  AVAILABLE: 'Available',
  RESERVED: 'Reserved',
  BOOKED: 'Booked',
  SOLD: 'Sold',
  NOT_RELEASED: 'Not released',
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
