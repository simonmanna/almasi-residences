import { describe, expect, it } from 'vitest';
import { computeLeadScore, leadSourceFromUtm, taskBucket, temperatureFor, type ScoreFacts } from './crm.js';

const now = new Date('2026-09-19T12:00:00Z');
const base: ScoreFacts = {
  budgetMaxMinor: null,
  targetPriceMinor: null,
  budgetConfirmed: false,
  hasResidence: false,
  hasRequirements: false,
  viewingBooked: false,
  viewingCompleted: false,
  responsive: false,
  timeline: null,
  financingRequired: null,
  decisionMaker: null,
  repeatCount: 0,
  leadSource: 'WEBSITE',
  openDeal: false,
  lastActivityAt: now,
  createdAt: now,
};

describe('computeLeadScore', () => {
  it('scores an empty lead at zero with no reasons', () => {
    expect(computeLeadScore(base, null, now)).toEqual({ score: 0, items: [] });
  });

  it('explains every point it gives', () => {
    const r = computeLeadScore({ ...base, budgetMaxMinor: 18_000_000, targetPriceMinor: 18_000_000, hasResidence: true, viewingBooked: true, timeline: 'WITHIN_3_MONTHS' }, null, now);
    expect(r.items.map((i) => i.key)).toEqual(['BUDGET_MATCH', 'RESIDENCE_SELECTED', 'VIEWING_BOOKED', 'TIMELINE_SOON']);
    expect(r.score).toBe(20 + 15 + 15 + 10);
  });

  it('respects admin overrides and disabled rules', () => {
    const r = computeLeadScore({ ...base, hasResidence: true, viewingBooked: true }, [{ key: 'RESIDENCE_SELECTED', points: 40, enabled: true }, { key: 'VIEWING_BOOKED', points: 15, enabled: false }], now);
    expect(r).toEqual({ score: 40, items: [{ key: 'RESIDENCE_SELECTED', label: 'Specific residence selected', points: 40 }] });
  });

  it('penalises a stale lead but never goes below zero', () => {
    const r = computeLeadScore({ ...base, lastActivityAt: new Date('2026-07-01T00:00:00Z') }, null, now);
    expect(r.items[0]?.key).toBe('STALE');
    expect(r.score).toBe(0);
  });

  it('caps at 100', () => {
    const all: ScoreFacts = { ...base, budgetMaxMinor: 1, targetPriceMinor: 1, budgetConfirmed: true, hasResidence: true, hasRequirements: true, viewingBooked: true, viewingCompleted: true, responsive: true, timeline: 'IMMEDIATE', financingRequired: false, decisionMaker: 'Self', repeatCount: 2, leadSource: 'REFERRAL', openDeal: true };
    expect(computeLeadScore(all, null, now).score).toBe(100);
  });
});

describe('temperatureFor', () => {
  it('derives from the score unless overridden', () => {
    expect(temperatureFor(75, null)).toBe('HOT');
    expect(temperatureFor(45, null)).toBe('WARM');
    expect(temperatureFor(10, null)).toBe('COLD');
    expect(temperatureFor(10, 'HOT')).toBe('HOT');
  });
});

describe('leadSourceFromUtm', () => {
  it('reads the channel from the tags', () => {
    expect(leadSourceFromUtm('facebook', 'cpc')).toBe('FACEBOOK');
    expect(leadSourceFromUtm(null, null, 'https://www.google.com/')).toBe('GOOGLE');
    expect(leadSourceFromUtm('partner', 'referral')).toBe('REFERRAL');
    expect(leadSourceFromUtm(null, null, null)).toBe('WEBSITE');
  });
});

describe('taskBucket', () => {
  it('buckets by the local day', () => {
    const at = new Date(2026, 8, 19, 12, 0);
    expect(taskBucket(new Date(2026, 8, 19, 9, 0), at)).toBe('overdue');
    expect(taskBucket(new Date(2026, 8, 19, 23, 59), at)).toBe('today');
    expect(taskBucket(new Date(2026, 8, 20, 10, 0), at)).toBe('tomorrow');
    expect(taskBucket(new Date(2026, 8, 25, 10, 0), at)).toBe('upcoming');
    expect(taskBucket(null, at)).toBe('someday');
  });
});
