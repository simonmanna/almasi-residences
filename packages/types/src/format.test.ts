import { describe, expect, it } from 'vitest';
import {
  formatArea,
  formatCount,
  formatDate,
  formatDistance,
  formatMoney,
  formatMoneyPlain,
  formatMoneyRange,
  formatPercent,
  formatQuarter,
} from './format.js';

describe('formatMoney', () => {
  it('renders whole units with grouping and no decimals', () => {
    expect(formatMoney({ amountMinor: 28_500_000, currency: 'USD' })).toBe('$285,000');
  });

  it('rounds rather than exposing cents in a headline price', () => {
    expect(formatMoney({ amountMinor: 28_500_050, currency: 'USD' })).toBe('$285,001');
  });

  it('can show decimals when a schedule row needs them', () => {
    expect(formatMoney({ amountMinor: 28_500_050, currency: 'USD' }, 'en-GB', { withDecimals: true }))
      .toBe('$285,000.50');
  });

  it('handles zero-decimal currencies', () => {
    expect(formatMoney({ amountMinor: 4_500_000, currency: 'JPY' })).toBe('¥4,500,000');
  });

  it('formats plain for table columns', () => {
    expect(formatMoneyPlain({ amountMinor: 28_500_000, currency: 'USD' })).toBe('285,000');
  });

  it('collapses a range when min equals max', () => {
    const m = { amountMinor: 28_500_000, currency: 'USD' };
    expect(formatMoneyRange(m, m)).toBe('$285,000');
    expect(formatMoneyRange(m, { amountMinor: 39_000_000, currency: 'USD' }))
      .toBe('$285,000 – $390,000');
  });
});

describe('formatArea', () => {
  it('renders one decimal and the unit', () => {
    expect(formatArea(142)).toBe('142.0 m²');
    expect(formatArea(142.44)).toBe('142.4 m²');
  });
});

describe('formatDistance', () => {
  it('uses metres below a kilometre', () => {
    expect(formatDistance(940)).toBe('940 m');
  });
  it('uses kilometres to one decimal above', () => {
    expect(formatDistance(2400)).toBe('2.4 km');
  });
});

describe('formatDate', () => {
  it('never renders an ambiguous numeric date', () => {
    const out = formatDate('2027-04-03T00:00:00Z');
    expect(out).toBe('3 Apr 2027');
    expect(out).not.toMatch(/\d+\/\d+/);
  });
  it('renders handover as a quarter', () => {
    expect(formatQuarter('2027-04-03T00:00:00Z')).toBe('Q2 2027');
    expect(formatQuarter('2027-12-31T00:00:00Z')).toBe('Q4 2027');
  });
});

describe('formatPercent', () => {
  it('keeps fractional milestone percentages', () => {
    expect(formatPercent(12.5)).toBe('12.5%');
    expect(formatPercent(20)).toBe('20%');
  });
});

describe('formatCount', () => {
  it('spells small counts, per the §2.7 voice rules', () => {
    expect(formatCount(6)).toBe('Six');
  });
  it('uses numerals once a count is scannable data', () => {
    expect(formatCount(92)).toBe('92');
  });
});
