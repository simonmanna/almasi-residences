/**
 * §9 Phase 5 — the concierge, as a deterministic engine plus a narration layer.
 *
 * The rule the whole design exists to enforce: **the model never produces a
 * number.** Intent parsing extracts structured filters, a real database query
 * returns exact rows, and the model is only allowed to write prose about that
 * result. Prices, areas, dates and availability are rendered by the UI from the
 * structured result.
 *
 * This module is the deterministic half — parsing and the output guard. Both
 * are pure, so both are testable without a database or a model.
 */

import type { Orientation, UnitStatus } from './inventory.js';

export interface ConciergeFilters {
  bedrooms: number[];
  priceMinorMax: number | null;
  priceMinorMin: number | null;
  orientations: Orientation[];
  viewTags: string[];
  statuses: UnitStatus[];
  floorMin: number | null;
  areaSqmMin: number | null;
}

export const EMPTY_CONCIERGE_FILTERS: ConciergeFilters = {
  bedrooms: [],
  priceMinorMax: null,
  priceMinorMin: null,
  orientations: [],
  viewTags: [],
  statuses: [],
  floorMin: null,
  areaSqmMin: null,
};

const WORD_NUMBERS: Record<string, number> = {
  studio: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
};

const ORIENTATION_WORDS: Record<string, Orientation> = {
  north: 'N',
  'north-east': 'NE',
  northeast: 'NE',
  east: 'E',
  'south-east': 'SE',
  southeast: 'SE',
  south: 'S',
  'south-west': 'SW',
  southwest: 'SW',
  west: 'W',
  'north-west': 'NW',
  northwest: 'NW',
};

/** Longest first: "south-east" must be tested before "south". */
const ORIENTATION_ENTRIES = Object.entries(ORIENTATION_WORDS).sort(
  (a, b) => b[0].length - a[0].length,
) as [string, Orientation][];

/** Matches the seeded view tags. Extend alongside the content, not the model. */
const VIEW_WORDS = ['golf', 'valley', 'city', 'hills', 'sunset'];

/**
 * Parse a visitor's sentence into structured filters.
 *
 * Deliberately a parser and not a model call: an intent that reaches the
 * database has to be auditable, and "two bedrooms under $150,000" must produce
 * exactly the same query every time it is asked.
 */
export function parseIntent(text: string): ConciergeFilters {
  const q = text.toLowerCase();
  const filters: ConciergeFilters = {
    ...EMPTY_CONCIERGE_FILTERS,
    bedrooms: [],
    orientations: [],
    viewTags: [],
    statuses: [],
  };

  // Bedrooms: "2 bed", "two bedroom", "studio".
  if (/\bstudio\b/.test(q)) filters.bedrooms.push(0);
  for (const m of q.matchAll(/(\d+|one|two|three|four|five)[\s-]*(?:bed(?:room)?s?|br)\b/g)) {
    const raw = m[1]!;
    const n = WORD_NUMBERS[raw] ?? Number.parseInt(raw, 10);
    if (Number.isFinite(n) && !filters.bedrooms.includes(n)) filters.bedrooms.push(n);
  }

  // Budget: "under $150,000", "below 150k", "up to 150000".
  const budget = q.match(/(?:under|below|less than|up to|max(?:imum)?|budget of)\s*\$?\s*([\d,.]+)\s*(k|m)?/);
  if (budget) filters.priceMinorMax = toMinor(budget[1]!, budget[2]);

  const floor =
    q.match(/(?:above|from|higher than|at least)\s*floor\s*(\d+)/) ??
    q.match(/(?:above|from|higher than|at least)\s*(?:the\s*)?(\d+)(?:st|nd|rd|th)\s*floor/);
  if (floor) filters.floorMin = Number.parseInt(floor[1]!, 10);

  const minPrice = q.match(/(?:over|above|more than|at least)\s*\$\s*([\d,.]+)\s*(k|m)?/);
  if (minPrice) filters.priceMinorMin = toMinor(minPrice[1]!, minPrice[2]);

  const area = q.match(/(?:at least|over|more than|minimum)\s*([\d,.]+)\s*(?:m2|m²|sqm|square metres?)/);
  if (area) filters.areaSqmMin = Number.parseFloat(area[1]!.replace(/,/g, ''));

  // Compass points are written three ways ("south-east", "southeast", "south
  // east"); normalising the spaced form lets one pattern cover all three.
  const normalised = q.replace(/\b(north|south)\s+(east|west)\b/g, '$1-$2');
  for (const [word, code] of ORIENTATION_ENTRIES) {
    // Three constraints, each earning its place:
    //   (?<![-\w])  — "east" must not match inside "south-east"
    //   (?!-(?:east|west)) — "south" must not match inside "south-east", but
    //                        "west-facing" must still match
    //   the -facing / facing- forms — a bare "north" is a location ("north of
    //   the city"), not a request for north-facing apartments
    const w = `(?<![-\\w])${word}(?!-(?:east|west))`;
    if (new RegExp(`${w}[\\s-]*facing|facing\\s+${w}`).test(normalised)) {
      if (!filters.orientations.includes(code)) filters.orientations.push(code);
    }
  }

  for (const tag of VIEW_WORDS) {
    if (new RegExp(`${tag}\\s*(view|outlook|facing)|(view|looking)\\s*(over|of|onto)?\\s*(the\\s*)?${tag}`).test(q)) {
      if (!filters.viewTags.includes(tag)) filters.viewTags.push(tag);
    }
  }

  // "available now", "still available", "what can I buy"
  if (/\bavailable\b|\bfor sale\b|\bcan i buy\b|\bstill\b/.test(q)) filters.statuses.push('AVAILABLE');

  return filters;
}

function toMinor(digits: string, suffix?: string): number {
  const base = Number.parseFloat(digits.replace(/,/g, ''));
  const multiplier = suffix === 'k' ? 1_000 : suffix === 'm' ? 1_000_000 : 1;
  return Math.round(base * multiplier * 100);
}

/**
 * §9 Phase 5 — "The model never emits a number. Reject any output containing a
 * digit absent from the result set."
 *
 * The allow-list is built from the actual query result. Anything else — an
 * invented price, a hallucinated floor count, a made-up completion year — fails
 * the check and the answer is replaced by the deterministic summary.
 */
export interface NarrationGuardResult {
  ok: boolean;
  offendingNumbers: string[];
}

export function checkNarration(prose: string, allowedNumbers: (string | number)[]): NarrationGuardResult {
  const allowed = new Set<string>();
  for (const value of allowedNumbers) {
    const s = String(value);
    allowed.add(s);
    // A price may legitimately be written grouped or plain.
    allowed.add(s.replace(/,/g, ''));
    allowed.add(Number(s.replace(/,/g, '')).toLocaleString('en-GB'));
  }

  const offending: string[] = [];
  for (const match of prose.matchAll(/\d[\d,.]*/g)) {
    const raw = match[0]!.replace(/[.,]$/, '');
    if (allowed.has(raw) || allowed.has(raw.replace(/,/g, ''))) continue;
    offending.push(raw);
  }

  return { ok: offending.length === 0, offendingNumbers: offending };
}

/**
 * The deterministic answer. This is what the visitor sees when narration is
 * unavailable, fails the guard, or is switched off — so it has to stand on its
 * own, not read as an error state.
 */
export function deterministicSummary(result: {
  matched: number;
  total: number;
  priceMinorFrom: number | null;
  currency: string;
  formatMoney: (minor: number, currency: string) => string;
}): string {
  if (result.matched === 0) {
    return 'Nothing currently available matches that. Widening the budget or the outlook usually helps.';
  }
  const price =
    result.priceMinorFrom !== null
      ? `, from ${result.formatMoney(result.priceMinorFrom, result.currency)}`
      : '';
  return `${result.matched} of ${result.total} available apartments match${price}.`;
}
