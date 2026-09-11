import { describe, expect, it } from 'vitest';
import { developmentJsonLd, typologyJsonLd } from '../lib/seo';
import { hrefFor, NAV_SECTIONS, SECTIONS, SINGLE_PAGE_ORDER } from '../components/sections/registry';
import type { DevelopmentDto, TypologyDto } from '../lib/api';

const typology = (over: Partial<TypologyDto> = {}): TypologyDto => ({
  id: 't1',
  slug: 'two-bed',
  name: 'Two bedroom',
  bedrooms: 2,
  bathrooms: 2,
  areaSqmMin: 96,
  areaSqmMax: 108,
  descriptionMd: null,
  floorPlanSvgUrl: null,
  summary: { total: 27, available: 15, priceMinorFrom: 21_780_000 },
  ...over,
});

const dev: DevelopmentDto = {
  id: 'd1',
  slug: 'almasi-residences',
  name: 'Almasi Residences',
  tagline: 'Twenty-eight homes in Kimihurura',
  descriptionMd: '',
  city: 'Kigali',
  country: 'RW',
  currency: 'USD',
  handoverDate: '2027-09-30T00:00:00.000Z',
  latitude: -1.9403,
  longitude: 30.0915,
  typologies: [typology(), typology({ id: 't2', slug: 'penthouse', name: 'Penthouse', summary: { total: 2, available: 0, priceMinorFrom: null } })],
  amenities: [],
  landmarks: [],
  milestones: [],
  faqs: [],
  seo: null,
  mediaSets: [],
  summary: {
    total: 28,
    byStatus: { AVAILABLE: 18 },
    available: 18,
    percentSold: 21,
    priceMinorMin: 9_500_000,
    priceMinorMax: 48_000_000,
  },
};

describe('§9 task 8 — structured data', () => {
  it('describes the development with real counts', () => {
    const ld = developmentJsonLd(dev);
    expect(ld['@type']).toBe('Residence');
    expect(ld.numberOfAccommodationUnits).toBe(28);
    expect(ld.numberOfAvailableAccommodationUnits).toBe(18);
    expect(ld.geo.latitude).toBe(-1.9403);
  });

  it('offers only typologies that actually have an available price', () => {
    // §13 — publishing a price for something nobody can buy is a
    // misrepresentation, and Google penalises it besides.
    const ld = developmentJsonLd(dev);
    expect(ld.makesOffer).toHaveLength(1);
    expect(ld.makesOffer[0]!.name).toBe('Two bedroom');
  });

  it('converts minor units to a major-unit price', () => {
    const ld = developmentJsonLd(dev);
    expect(ld.makesOffer[0]!.price).toBe(217_800);
  });

  it('omits offers entirely for a sold-out typology', () => {
    const ld = typologyJsonLd(
      typology({ summary: { total: 2, available: 0, priceMinorFrom: null } }),
      dev,
    );
    expect('offers' in ld).toBe(false);
  });
});

describe('§6.1 section registry', () => {
  it('gives single-page mode anchors and multi-page mode routes', () => {
    expect(hrefFor('availability', 'single')).toBe('#availability');
    expect(hrefFor('availability', 'multi')).toBe('/availability');
  });

  it('keeps navigation a subset of the sections that exist', () => {
    for (const id of NAV_SECTIONS) expect(SECTIONS[id]).toBeDefined();
    for (const id of SINGLE_PAGE_ORDER) expect(SECTIONS[id]).toBeDefined();
  });

  it('renders every registered section in single-page mode', () => {
    // The two modes share components; if a section exists but single-page mode
    // never renders it, the modes have silently diverged.
    expect(new Set(SINGLE_PAGE_ORDER)).toEqual(new Set(Object.keys(SECTIONS)));
  });
});
