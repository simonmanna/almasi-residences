import { describe, expect, it } from 'vitest';
import { checkNarration, deterministicSummary, parseIntent } from './concierge.js';

describe('§9 Phase 5 — intent parsing', () => {
  it('parses the specification’s own example', () => {
    // "two bedrooms under $150,000 with a golf view, available now"
    const f = parseIntent('two bedrooms under $150,000 with a golf view, available now');
    expect(f.bedrooms).toEqual([2]);
    expect(f.priceMinorMax).toBe(15_000_000);
    expect(f.viewTags).toEqual(['golf']);
    expect(f.statuses).toEqual(['AVAILABLE']);
  });

  it('reads numerals, words and studios', () => {
    expect(parseIntent('3 bed').bedrooms).toEqual([3]);
    expect(parseIntent('a two-bedroom').bedrooms).toEqual([2]);
    expect(parseIntent('do you have a studio').bedrooms).toEqual([0]);
  });

  it('understands k and m shorthand', () => {
    expect(parseIntent('under 150k').priceMinorMax).toBe(15_000_000);
    expect(parseIntent('below $1.2m').priceMinorMax).toBe(120_000_000);
    expect(parseIntent('up to 99,500').priceMinorMax).toBe(9_950_000);
  });

  it('only takes an orientation when it is about facing', () => {
    expect(parseIntent('west-facing please').orientations).toEqual(['W']);
    expect(parseIntent('facing south east').orientations).toEqual(['SE']);
    expect(parseIntent('south-east facing').orientations).toEqual(['SE']);
    // "north of the city" is a location, not a request for north-facing units.
    expect(parseIntent('is it north of the city centre').orientations).toEqual([]);
  });

  it('parses floors and minimum area', () => {
    expect(parseIntent('above floor 6').floorMin).toBe(6);
    expect(parseIntent('at least 120 sqm').areaSqmMin).toBe(120);
  });

  it('returns empty filters for a question with no criteria', () => {
    const f = parseIntent('hello, tell me about the building');
    expect(f.bedrooms).toEqual([]);
    expect(f.priceMinorMax).toBeNull();
    expect(f.viewTags).toEqual([]);
  });
});

describe('§9 Phase 5 — the model never emits a number', () => {
  const allowed = [15, 92, 285_000, '285,000'];

  it('passes prose that reuses only numbers from the result', () => {
    expect(checkNarration('Fifteen of the 92 apartments match, from 285,000.', allowed).ok).toBe(true);
  });

  it('passes prose with no numbers at all', () => {
    expect(checkNarration('Several west-facing apartments are still available.', allowed).ok).toBe(true);
  });

  it('rejects an invented price', () => {
    const r = checkNarration('They start at around 240,000.', allowed);
    expect(r.ok).toBe(false);
    expect(r.offendingNumbers).toContain('240,000');
  });

  it('rejects a hallucinated completion year', () => {
    const r = checkNarration('The building completes in 2026.', allowed);
    expect(r.ok).toBe(false);
    expect(r.offendingNumbers).toContain('2026');
  });

  it('rejects a plausible-but-absent count', () => {
    // The dangerous case: a number that reads as if it came from the data.
    const r = checkNarration('There are 14 matching apartments.', allowed);
    expect(r.ok).toBe(false);
    expect(r.offendingNumbers).toEqual(['14']);
  });

  it('accepts a grouped or ungrouped rendering of the same figure', () => {
    expect(checkNarration('From 285000.', allowed).ok).toBe(true);
    expect(checkNarration('From 285,000.', allowed).ok).toBe(true);
  });

  it('ignores a trailing full stop rather than reading it as a decimal', () => {
    expect(checkNarration('Ninety-two. Exactly 92.', allowed).ok).toBe(true);
  });
});

describe('the deterministic answer stands on its own', () => {
  const fmt = (minor: number, currency: string) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: 0,
    }).format(minor / 100);

  it('states the match without adjectives', () => {
    expect(
      deterministicSummary({
        matched: 6,
        total: 48,
        priceMinorFrom: 21_780_000,
        currency: 'USD',
        formatMoney: fmt,
      }),
    ).toBe('6 of 48 available apartments match, from $217,800.');
  });

  it('says so plainly when nothing matches', () => {
    const s = deterministicSummary({
      matched: 0,
      total: 48,
      priceMinorFrom: null,
      currency: 'USD',
      formatMoney: fmt,
    });
    expect(s).toContain('Nothing currently available matches');
    expect(s).not.toMatch(/!/);
  });
});
