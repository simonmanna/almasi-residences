import { describe, expect, it } from 'vitest';
import type { InventoryDto, StackUnitDto } from '../lib/api';
import {
  applyLive,
  EMPTY_FILTER,
  filterFromSearch,
  filterToSearch,
  floorsOf,
  matchesFilter,
  sortResidences,
  summarise,
  toResidences,
  visiblePriceMinor,
} from '../lib/residences';

const unit = (over: Partial<StackUnitDto> & Pick<StackUnitDto, 'id' | 'code'>): StackUnitDto => ({
  status: 'AVAILABLE',
  priceMinor: 95_000_00,
  currency: 'USD',
  areaSqm: 69,
  orientation: 'S',
  viewTags: ['city'],
  positionIndex: 0,
  widthRatio: 1,
  meshName: null,
  typology: { slug: 'one-bed', name: 'One bedroom', bedrooms: 1 },
  ...over,
});

const inventory: InventoryDto = {
  slug: 'almasi-residences',
  currency: 'USD',
  generatedAt: '2026-09-11T00:00:00.000Z',
  summary: {
    total: 5,
    byStatus: {},
    available: 0,
    percentSold: 0,
    priceMinorMin: null,
    priceMinorMax: null,
  },
  buildings: [
    {
      id: 'b1',
      name: 'Almasi Block',
      floorCount: 5,
      floors: [
        { id: 'fb', level: -1, label: 'Basement', heightM: 0, units: [] },
        {
          id: 'f2',
          level: 2,
          label: 'Floor 2',
          heightM: 9.6,
          units: [
            unit({ id: 'a2', code: 'A2', areaSqm: 69 }),
            unit({ id: 'b2', code: 'B2', areaSqm: 70, status: 'SOLD', positionIndex: 1 }),
            unit({
              id: 'e2',
              code: 'E2',
              areaSqm: 126,
              status: 'BOOKED',
              positionIndex: 4,
              priceMinor: 177_000_00,
              typology: { slug: 'two-bed-corner', name: 'Two bedroom corner', bedrooms: 2 },
            }),
          ],
        },
        {
          id: 'f4',
          level: 4,
          label: 'Penthouse',
          heightM: 16,
          units: [
            unit({
              id: 'pha',
              code: 'PH-A',
              areaSqm: 180,
              priceMinor: 240_000_00,
              typology: { slug: 'penthouse-two', name: 'Two bedroom penthouse', bedrooms: 2 },
            }),
            unit({
              id: 'phc',
              code: 'PH-C',
              areaSqm: 390,
              positionIndex: 2,
              status: 'NOT_RELEASED',
              priceMinor: 480_000_00,
              typology: { slug: 'penthouse-three', name: 'Three bedroom penthouse', bedrooms: 3 },
            }),
          ],
        },
      ],
    },
  ],
};

const residences = toResidences(inventory, { 'one-bed': 1, 'two-bed-corner': 2, 'penthouse-two': 2 });

describe('residence model', () => {
  it('maps every unit once, floor by floor', () => {
    expect(residences.map((r) => r.code)).toEqual(['A2', 'B2', 'E2', 'PH-A', 'PH-C']);
  });

  it('reads penthouse codes as words and slugs them for URLs', () => {
    const ph = residences.find((r) => r.code === 'PH-A')!;
    expect(ph.label).toBe('PH A');
    expect(ph.slug).toBe('ph-a');
    expect(ph.type).toBe('penthouse');
    expect(ph.bathrooms).toBe(2);
  });

  it('shows a booked unit as reserved and a held-back unit as unavailable', () => {
    expect(residences.find((r) => r.code === 'E2')!.publicStatus).toBe('reserved');
    expect(residences.find((r) => r.code === 'PH-C')!.publicStatus).toBe('unavailable');
  });

  it('publishes a price only for an available residence', () => {
    expect(visiblePriceMinor(residences.find((r) => r.code === 'A2')!)).toBe(95_000_00);
    expect(visiblePriceMinor(residences.find((r) => r.code === 'B2')!)).toBeNull();
  });
});

describe('derived counts', () => {
  it('counts by public status and by type from the same list', () => {
    const s = summarise(residences);
    expect(s.total).toBe(5);
    expect(s.byStatus).toEqual({ available: 2, reserved: 1, sold: 1, unavailable: 1 });
    expect(s.byType['one-bedroom']).toMatchObject({ total: 2, available: 1, areaMin: 69, areaMax: 70 });
    expect(s.byType.penthouse.priceFromMinor).toBe(240_000_00);
    expect(s.byType['two-bedroom'].priceFromMinor).toBeNull();
  });

  it('lists every floor top first, including the basement', () => {
    expect(floorsOf(inventory, residences).map((f) => f.mark)).toEqual(['PH', '2', 'B']);
  });
});

describe('filters', () => {
  it('matches by type, size band and status together', () => {
    const f = { ...EMPTY_FILTER, types: ['one-bedroom' as const], statuses: ['available' as const] };
    expect(residences.filter((r) => matchesFilter(r, f)).map((r) => r.code)).toEqual(['A2']);
    const big = { ...EMPTY_FILTER, sizes: ['over-200' as const] };
    expect(residences.filter((r) => matchesFilter(r, big)).map((r) => r.code)).toEqual(['PH-C']);
  });

  it('never lets a residence without a public price satisfy a price cap', () => {
    const f = { ...EMPTY_FILTER, maxPriceMinor: 1_000_000_00 };
    expect(residences.filter((r) => matchesFilter(r, f)).map((r) => r.code)).toEqual(['A2', 'PH-A']);
  });

  it('round-trips through the query string', () => {
    const filter = { ...EMPTY_FILTER, types: ['penthouse' as const], floors: [4], maxPriceMinor: 300_000_00 };
    const search = filterToSearch(filter, 'size-desc');
    expect(filterFromSearch(new URLSearchParams(search))).toEqual({ filter, sort: 'size-desc' });
  });

  it('ignores values it does not recognise', () => {
    const { filter, sort } = filterFromSearch({ type: 'castle,penthouse', beds: 'x,2', sort: 'nope' });
    expect(filter.types).toEqual(['penthouse']);
    expect(filter.bedrooms).toEqual([2]);
    expect(sort).toBe('floor');
  });

  it('sorts unpriced residences last whichever way price runs', () => {
    expect(sortResidences(residences, 'price-desc').map((r) => r.code).slice(0, 2)).toEqual(['PH-A', 'A2']);
    expect(sortResidences(residences, 'price-asc').at(-1)!.publicStatus).not.toBe('available');
  });
});

describe('live deltas', () => {
  it('folds a status change into the stack', () => {
    const next = applyLive(inventory, [{ id: 'a2', status: 'RESERVED', priceMinor: 95_000_00 }]);
    expect(next).not.toBe(inventory);
    expect(toResidences(next).find((r) => r.code === 'A2')!.publicStatus).toBe('reserved');
  });

  it('returns the same object when nothing changed', () => {
    expect(applyLive(inventory, [{ id: 'a2', status: 'AVAILABLE', priceMinor: 95_000_00 }])).toBe(inventory);
  });
});
