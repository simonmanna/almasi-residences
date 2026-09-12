import { describe, expect, it } from 'vitest';
import { area, money } from './format';

/**
 * Money in the admin used to divide every figure by a hardcoded 100 and default
 * to US dollars. Rwandan francs have no minor unit, so a price of 250,000,000
 * RWF was shown as 2,500,000 — an order-of-magnitude error on the number the
 * sales team quotes.
 */
describe('money', () => {
  it('renders a two-decimal currency from its minor units', () => {
    expect(money(25_000_000, 'USD')).toBe('$250,000');
  });

  it('renders a zero-decimal currency without dividing it', () => {
    // 250,000,000 RWF is 250,000,000 minor units, because RWF has none.
    expect(money(250_000_000, 'RWF')).toContain('250,000,000');
  });

  it('never shows a nought-decimal currency as a hundredth of itself', () => {
    expect(money(250_000_000, 'RWF')).not.toContain('2,500,000.');
  });

  it('shows a dash rather than a zero for a missing figure', () => {
    expect(money(null)).toBe('—');
    expect(money(undefined)).toBe('—');
  });

  it('compacts only above the threshold, measured in the right units', () => {
    // 100,000 major units is the threshold in both currencies.
    expect(money(9_999_900, 'USD', { compact: true })).toBe('$99,999');
    expect(money(50_000_000, 'USD', { compact: true })).toBe('$500.0K');
    expect(money(99_999, 'RWF', { compact: true })).toContain('99,999');
  });
});

describe('area', () => {
  it('renders square metres to one decimal', () => {
    expect(area(101.5)).toBe('101.5 m²');
  });

  it('shows a dash for an unknown area', () => {
    expect(area(null)).toBe('—');
  });
});
