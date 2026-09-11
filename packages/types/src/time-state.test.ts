import { describe, expect, it } from 'vitest';
import {
  adjacentStates,
  fromTimeStateKey,
  isTimeState,
  timeStateForHour,
  toTimeStateKey,
  TIME_STATES,
} from './time-state.js';

describe('timeStateForHour', () => {
  it('maps the §6.2 boundaries', () => {
    expect(timeStateForHour(5)).toBe('dawn');
    expect(timeStateForHour(7.99)).toBe('dawn');
    expect(timeStateForHour(8)).toBe('day');
    expect(timeStateForHour(16.99)).toBe('day');
    expect(timeStateForHour(17)).toBe('dusk');
    expect(timeStateForHour(19.49)).toBe('dusk');
    expect(timeStateForHour(19.5)).toBe('night');
    expect(timeStateForHour(4.99)).toBe('night');
    expect(timeStateForHour(0)).toBe('night');
  });

  it('covers every hour of the day with a valid state', () => {
    for (let h = 0; h < 24; h += 0.25) {
      expect(isTimeState(timeStateForHour(h))).toBe(true);
    }
  });
});

describe('adjacentStates', () => {
  it('wraps, because the day is a cycle', () => {
    expect(adjacentStates('night')).toEqual(['dawn', 'dusk']);
    expect(adjacentStates('dawn')).toEqual(['day', 'night']);
  });

  it('never preloads all four — that is 4× the payload (§6.2)', () => {
    for (const s of TIME_STATES) {
      expect(adjacentStates(s)).toHaveLength(2);
      expect(adjacentStates(s)).not.toContain(s);
    }
  });
});

describe('schema key mapping', () => {
  it('round-trips through the Prisma enum casing', () => {
    for (const s of TIME_STATES) {
      expect(fromTimeStateKey(toTimeStateKey(s))).toBe(s);
    }
  });
});
