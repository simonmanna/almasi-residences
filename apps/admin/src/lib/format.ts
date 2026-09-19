import { humanise, minorDigits, STATUS_LABEL, toMajorUnits, type UnitStatus } from '@avida/types';

/**
 * Money in the development's own currency. `currency` is not optional in spirit:
 * the default exists only so a call site that has not loaded the property yet
 * renders something rather than throwing. The minor-unit rule comes from
 * @avida/types, so RWF (no minor unit) is not quoted at 1% of itself.
 */
export function money(minor: number | null | undefined, currency = 'USD', opts: { compact?: boolean } = {}): string {
  if (minor === null || minor === undefined) return '—';
  const compactFrom = 100_000 * 10 ** minorDigits(currency);
  const compact = Boolean(opts.compact) && Math.abs(minor) >= compactFrom;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? 'compact' : 'standard',
  }).format(toMajorUnits(minor, currency));
}

export const area = (sqm: number | null | undefined) => (sqm === null || sqm === undefined ? '—' : `${Number.isInteger(sqm) ? sqm : sqm.toFixed(1)} m²`);

export const num = (n: number | null | undefined) => (n === null || n === undefined ? '—' : new Intl.NumberFormat('en-US').format(n));

export function date(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}

export function dateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function ago(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const s = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  return date(value);
}

export const bytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);

/** `PH-A` → `PH A`, as the sales team says it. */
export const code = (c: string) => c.replace(/-/g, ' ');

export const toMinor = (major: string | number) => Math.round(Number(major) * 100);
export const toMajor = (minor: number | null | undefined) => (minor === null || minor === undefined ? '' : String(minor / 100));

/** §3 — the status colours the brief fixes: green, blue, orange, red, grey. */
export const STATUS_TONE: Record<UnitStatus, string> = {
  AVAILABLE: 'green',
  RESERVED: 'blue',
  BOOKED: 'orange',
  SOLD: 'red',
  UNAVAILABLE: 'grey',
};

export const statusLabel = (s: string) => STATUS_LABEL[s as UnitStatus] ?? humanise(s);

export const ENQUIRY_TONE: Record<string, string> = {
  NEW: 'blue',
  CONTACTED: 'sky',
  QUALIFIED: 'teal',
  VIEWING: 'purple',
  NEGOTIATION: 'orange',
  RESERVED: 'indigo',
  CONVERTED: 'green',
  LOST: 'grey',
  SPAM: 'red',
};

export const STAGE_TONE: Record<string, string> = {
  PROSPECT: 'grey',
  ENQUIRY: 'sky',
  INTERESTED: 'blue',
  RESERVATION: 'orange',
  BUYER: 'teal',
  OWNER: 'green',
  RESIDENT: 'purple',
};

export const PARKING_TONE: Record<string, string> = {
  AVAILABLE: 'green',
  RESERVED: 'blue',
  ASSIGNED: 'teal',
  SOLD: 'red',
  UNAVAILABLE: 'grey',
};

export const ORIENTATION_TEXT: Record<string, string> = {
  N: 'North',
  NE: 'North-east',
  E: 'East',
  SE: 'South-east',
  S: 'South',
  SW: 'South-west',
  W: 'West',
  NW: 'North-west',
};

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}
