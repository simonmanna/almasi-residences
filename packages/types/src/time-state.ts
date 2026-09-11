/**
 * §6.2 — the time-of-day system's shared vocabulary. The four states are a
 * closed set used by the schema (TimeState enum), the API, and the client
 * provider, so it is defined once here.
 */

export const TIME_STATES = ['dawn', 'day', 'dusk', 'night'] as const;
export type TimeState = (typeof TIME_STATES)[number];

/** Matches the Prisma `TimeState` enum, which is upper case. */
export type TimeStateKey = 'DAWN' | 'DAY' | 'DUSK' | 'NIGHT';

export function toTimeStateKey(s: TimeState): TimeStateKey {
  return s.toUpperCase() as TimeStateKey;
}

export function fromTimeStateKey(k: TimeStateKey): TimeState {
  return k.toLowerCase() as TimeState;
}

export function isTimeState(v: unknown): v is TimeState {
  return typeof v === 'string' && (TIME_STATES as readonly string[]).includes(v);
}

/** §6.2 — the visitor's local clock picks the opening state. */
export function timeStateForHour(hour: number): TimeState {
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 19.5) return 'dusk';
  return 'night';
}

export function timeStateForDate(d: Date = new Date()): TimeState {
  return timeStateForHour(d.getHours() + d.getMinutes() / 60);
}

/**
 * §6.2 preload strategy — load the current state eagerly and its neighbours
 * lazily. The cycle is a loop, so night is adjacent to dawn.
 */
export function adjacentStates(s: TimeState): TimeState[] {
  const i = TIME_STATES.indexOf(s);
  const n = TIME_STATES.length;
  return [TIME_STATES[(i + 1) % n]!, TIME_STATES[(i - 1 + n) % n]!];
}

/** Sentence-case labels for the scrubber's `aria-valuetext` (§2.4 — no ALL CAPS). */
export const TIME_STATE_LABEL: Record<TimeState, string> = {
  dawn: 'Dawn',
  day: 'Day',
  dusk: 'Dusk',
  night: 'Night',
};
