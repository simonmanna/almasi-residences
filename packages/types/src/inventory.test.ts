import { describe, expect, it } from 'vitest';
import {
  allowedTransitions,
  canTransition,
  EMPTY_FILTERS,
  unitMatches,
  UNIT_STATUSES,
  type UnitStatus,
} from './inventory.js';

const unit = {
  status: 'AVAILABLE' as UnitStatus,
  priceMinor: 20_000_000,
  orientation: 'SW' as const,
  typology: { slug: 'two-bed' },
};

describe('§5.5 status transitions', () => {
  it('allows the sales team’s normal path', () => {
    expect(canTransition('NOT_RELEASED', 'AVAILABLE')).toBe(true);
    expect(canTransition('AVAILABLE', 'RESERVED')).toBe(true);
    expect(canTransition('RESERVED', 'BOOKED')).toBe(true);
    expect(canTransition('BOOKED', 'SOLD')).toBe(true);
  });

  it('allows releasing a reservation back to available', () => {
    expect(canTransition('RESERVED', 'AVAILABLE')).toBe(true);
    expect(canTransition('BOOKED', 'AVAILABLE')).toBe(true);
  });

  it('treats SOLD as terminal', () => {
    expect(allowedTransitions('SOLD')).toEqual([]);
    for (const s of UNIT_STATUSES) {
      if (s !== 'SOLD') expect(canTransition('SOLD', s)).toBe(false);
    }
  });

  it('rejects skipping a stage', () => {
    expect(canTransition('AVAILABLE', 'SOLD')).toBe(false);
    expect(canTransition('NOT_RELEASED', 'RESERVED')).toBe(false);
  });

  it('treats a no-op as allowed, so re-saving a row is not an error', () => {
    for (const s of UNIT_STATUSES) expect(canTransition(s, s)).toBe(true);
  });
});

describe('§2.5 filters', () => {
  it('matches everything when no filter is set', () => {
    expect(unitMatches(unit, EMPTY_FILTERS)).toBe(true);
  });

  it('filters by typology, status, orientation and price ceiling', () => {
    expect(unitMatches(unit, { ...EMPTY_FILTERS, typologySlugs: ['studio'] })).toBe(false);
    expect(unitMatches(unit, { ...EMPTY_FILTERS, typologySlugs: ['two-bed'] })).toBe(true);
    expect(unitMatches(unit, { ...EMPTY_FILTERS, statuses: ['SOLD'] })).toBe(false);
    expect(unitMatches(unit, { ...EMPTY_FILTERS, orientations: ['N'] })).toBe(false);
    expect(unitMatches(unit, { ...EMPTY_FILTERS, priceMinorMax: 19_000_000 })).toBe(false);
    expect(unitMatches(unit, { ...EMPTY_FILTERS, priceMinorMax: 20_000_000 })).toBe(true);
  });

  it('combines filters with AND', () => {
    expect(
      unitMatches(unit, { ...EMPTY_FILTERS, typologySlugs: ['two-bed'], statuses: ['SOLD'] }),
    ).toBe(false);
  });
});
