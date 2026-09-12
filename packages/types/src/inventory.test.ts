import { describe, expect, it } from 'vitest';
import {
  allowedTransitions,
  canTransition,
  effectivePriceMinor,
  EMPTY_FILTERS,
  isSaleReversal,
  pricePerSqmMinor,
  PUBLIC_UNIT_STATUS,
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

describe('D-34 status changes', () => {
  it('lets the sales team move between open statuses freely', () => {
    expect(canTransition('AVAILABLE', 'RESERVED')).toBe(true);
    expect(canTransition('RESERVED', 'ON_HOLD')).toBe(true);
    expect(canTransition('ON_HOLD', 'AVAILABLE')).toBe(true);
    expect(canTransition('UNAVAILABLE', 'AVAILABLE')).toBe(true);
    expect(canTransition('AVAILABLE', 'SOLD')).toBe(true);
  });

  it('treats a move-in or move-out as not undoing the sale', () => {
    expect(canTransition('SOLD', 'OCCUPIED')).toBe(true);
    expect(canTransition('OCCUPIED', 'SOLD')).toBe(true);
  });

  it('guards undoing a sale behind the reverse-sale permission', () => {
    for (const to of ['AVAILABLE', 'RESERVED', 'ON_HOLD', 'UNAVAILABLE'] as UnitStatus[]) {
      expect(isSaleReversal('SOLD', to)).toBe(true);
      expect(canTransition('SOLD', to)).toBe(false);
      expect(canTransition('SOLD', to, true)).toBe(true);
      expect(canTransition('OCCUPIED', to)).toBe(false);
    }
    expect(allowedTransitions('SOLD')).toEqual(['OCCUPIED']);
  });

  it('treats a no-op as allowed, so re-saving a row is not an error', () => {
    for (const s of UNIT_STATUSES) expect(canTransition(s, s)).toBe(true);
  });

  it('never tells a visitor about a hold or an occupant', () => {
    expect(PUBLIC_UNIT_STATUS.ON_HOLD).toBe('reserved');
    expect(PUBLIC_UNIT_STATUS.OCCUPIED).toBe('sold');
  });
});

describe('pricing helpers', () => {
  it('applies a discount, and prefers a live promotion', () => {
    expect(effectivePriceMinor({ priceMinor: 100_00, discountMinor: 10_00 })).toBe(90_00);
    expect(effectivePriceMinor({ priceMinor: 100_00, promoPriceMinor: 80_00 })).toBe(80_00);
    const past = new Date('2020-01-01');
    expect(effectivePriceMinor({ priceMinor: 100_00, promoPriceMinor: 80_00, promoEndsAt: past })).toBe(100_00);
  });

  it('computes price per m² and refuses a zero area', () => {
    expect(pricePerSqmMinor(125_000_00, 69)).toBe(181_159);
    expect(pricePerSqmMinor(1, 0)).toBeNull();
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
