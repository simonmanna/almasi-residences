/**
 * §3.5 — every number, price, area, distance and date on the site is formatted
 * here. Components never call `Intl` directly, so the rules live in one tested
 * file rather than drifting across fifty call sites.
 */

/**
 * §3.5 — one locale for v1. No i18n framework, no locale routing.
 *
 * Read from configuration rather than hardcoded, because the development this
 * ships for is not decided yet (§15 Q2) and the locale changes every price and
 * date on the site. Next inlines NEXT_PUBLIC_* at build time, so this resolves
 * on both the server and the client.
 */
declare const process: { env: Record<string, string | undefined> } | undefined;

export const DEFAULT_LOCALE =
  (typeof process !== 'undefined' ? process?.env.NEXT_PUBLIC_LOCALE : undefined) || 'en-GB';

export interface Money {
  /** §4.2 — integer minor units (cents). Never a float. */
  amountMinor: number;
  currency: string;
}

const MINOR_UNITS: Record<string, number> = {
  // Currencies whose minor unit is not 1/100. Extend as needed.
  JPY: 0,
  KRW: 0,
  BHD: 3,
  KWD: 3,
  OMR: 3,
  TND: 3,
};

function minorDigits(currency: string): number {
  return MINOR_UNITS[currency.toUpperCase()] ?? 2;
}

/**
 * §3.5 — whole units, grouped separators, no decimals: `$285,000`.
 * Prices on this site are always whole; a price with cents is a data error,
 * so we round rather than render `285,000.50` in a headline.
 */
export function formatMoney(
  money: Money,
  locale: string = DEFAULT_LOCALE,
  opts: { withDecimals?: boolean } = {},
): string {
  const digits = minorDigits(money.currency);
  const major = money.amountMinor / 10 ** digits;
  const fraction = opts.withDecimals ? digits : 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency,
    // en-GB renders USD as "US$285,000" and JPY as "JP¥4,500,000" by default.
    // The site quotes one currency throughout, so the country prefix adds
    // nothing and reads as clutter in a headline price.
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction,
  }).format(major);
}

/** Bare grouped number with no currency symbol — for table columns that carry the symbol in the header. */
export function formatMoneyPlain(money: Money, locale: string = DEFAULT_LOCALE): string {
  const digits = minorDigits(money.currency);
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(money.amountMinor / 10 ** digits);
}

/** §3.5 — m² to one decimal. `142.4 m²` */
export function formatArea(sqm: number, locale: string = DEFAULT_LOCALE): string {
  const n = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(sqm);
  return `${n} m²`;
}

/** §3.5 — under 1km in whole metres, above in km to one decimal. */
export function formatDistance(metres: number, locale: string = DEFAULT_LOCALE): string {
  if (metres < 1000) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(metres)} m`;
  }
  const km = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(metres / 1000);
  return `${km} km`;
}

/**
 * §3.5 — `3 Apr 2027`. Never numeric-only: `03/04/2027` reads as two different
 * dates depending on where the buyer is from.
 *
 * Formatted in UTC deliberately. Every date this site shows is a calendar date,
 * not an instant: handover, a milestone due date, a progress capture. Rendering
 * a UTC midnight in the viewer's local zone moves it to the previous day for
 * anyone west of Greenwich, which is how a handover quarter silently slips.
 */
export function formatDate(date: Date | string, locale: string = DEFAULT_LOCALE): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

/** Handover and milestone copy: `Q2 2027`. */
export function formatQuarter(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
}

/** Percentages in the payment schedule. Milestones may be fractional (12.5%). */
export function formatPercent(percent: number, locale: string = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(percent) + '%';
}

/**
 * §2.7 — "Six of 92 units available", not "Limited units remaining!".
 * Small counts read as words; anything the buyer would scan reads as a numeral.
 */
const SMALL_COUNTS = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five',
  'Six', 'Seven', 'Eight', 'Nine', 'Ten',
] as const;

export function formatCount(n: number, locale: string = DEFAULT_LOCALE): string {
  const word = SMALL_COUNTS[n];
  return word ?? new Intl.NumberFormat(locale).format(n);
}

/** Range helper for "from" prices — collapses to a single value when min === max. */
export function formatMoneyRange(
  min: Money,
  max: Money,
  locale: string = DEFAULT_LOCALE,
): string {
  if (min.amountMinor === max.amountMinor) return formatMoney(min, locale);
  return `${formatMoney(min, locale)} – ${formatMoney(max, locale)}`;
}
