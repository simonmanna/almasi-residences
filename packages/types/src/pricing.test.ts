import { describe, expect, it } from 'vitest';
import {
  computeSchedule,
  ScheduleError,
  type PaymentMilestoneInput,
} from './pricing.js';

const START = new Date('2026-01-15T00:00:00Z');
const HANDOVER = new Date('2027-09-30T00:00:00Z');

/** The seed structure from §4.6 — six milestones summing to 100. */
const MILESTONES: PaymentMilestoneInput[] = [
  { id: 'm1', sortOrder: 1, label: 'Reservation', percent: 5, triggerType: 'ON_RESERVATION' },
  { id: 'm2', sortOrder: 2, label: 'Contract signing', percent: 15, triggerType: 'ON_SIGNING' },
  {
    id: 'm3', sortOrder: 3, label: 'Structure complete', percent: 20,
    triggerType: 'ON_CONSTRUCTION_STAGE', triggerNote: 'On completion of the roof slab',
  },
  {
    id: 'm4', sortOrder: 4, label: 'Facade complete', percent: 20,
    triggerType: 'ON_DATE', triggerDate: new Date('2027-03-01T00:00:00Z'),
  },
  {
    id: 'm5', sortOrder: 5, label: 'Fit-out complete', percent: 20,
    triggerType: 'ON_CONSTRUCTION_STAGE', triggerNote: 'On completion of internal fit-out',
  },
  { id: 'm6', sortOrder: 6, label: 'Handover', percent: 20, triggerType: 'ON_HANDOVER' },
];

describe('computeSchedule', () => {
  it('sums to exactly the unit price', () => {
    const s = computeSchedule({ priceMinor: 28_500_000, currency: 'USD' }, MILESTONES, HANDOVER, START);
    expect(s.rows.reduce((a, r) => a + r.amountMinor, 0)).toBe(28_500_000);
  });

  // §5.6 rule 3 — the reason the rule exists.
  it('puts the rounding residue in the final row for a price that does not divide evenly', () => {
    const thirds: PaymentMilestoneInput[] = [
      { id: 'a', sortOrder: 1, label: 'A', percent: 33.33, triggerType: 'ON_RESERVATION' },
      { id: 'b', sortOrder: 2, label: 'B', percent: 33.33, triggerType: 'ON_SIGNING' },
      { id: 'c', sortOrder: 3, label: 'C', percent: 33.34, triggerType: 'ON_HANDOVER' },
    ];
    const price = 10_000_001;
    const s = computeSchedule({ priceMinor: price, currency: 'USD' }, thirds, HANDOVER, START);
    expect(s.rows.reduce((a, r) => a + r.amountMinor, 0)).toBe(price);
    expect(s.cumulative[s.cumulative.length - 1]).toBe(price);
  });

  it('never loses or invents a minor unit across a wide price sweep', () => {
    for (let price = 9_999_900; price <= 10_000_100; price++) {
      const s = computeSchedule({ priceMinor: price, currency: 'USD' }, MILESTONES, HANDOVER, START);
      expect(s.rows.reduce((a, r) => a + r.amountMinor, 0)).toBe(price);
    }
  });

  it('orders rows by sortOrder regardless of input order', () => {
    const shuffled = [...MILESTONES].reverse();
    const s = computeSchedule({ priceMinor: 28_500_000, currency: 'USD' }, shuffled, HANDOVER, START);
    expect(s.rows.map((r) => r.sortOrder)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('resolves each trigger type to the right due date', () => {
    const s = computeSchedule({ priceMinor: 28_500_000, currency: 'USD' }, MILESTONES, HANDOVER, START);
    const [reservation, signing, stage, fixed, , handover] = s.rows;
    expect(reservation!.dueDate).toEqual(START);
    expect(signing!.dueDate).toEqual(new Date('2026-01-29T00:00:00Z'));
    expect(fixed!.dueDate).toEqual(new Date('2027-03-01T00:00:00Z'));
    expect(handover!.dueDate).toEqual(HANDOVER);
    // A construction stage with no date shows its note instead — never a guess.
    expect(stage!.dueDate).toBeNull();
    expect(stage!.triggerNote).toBe('On completion of the roof slab');
  });

  it('rejects milestones that do not sum to 100', () => {
    const bad = MILESTONES.slice(0, 5);
    expect(() => computeSchedule({ priceMinor: 1000, currency: 'USD' }, bad, HANDOVER, START))
      .toThrow(ScheduleError);
  });

  it('accepts fractional percentages that sum to 100', () => {
    const halves: PaymentMilestoneInput[] = [
      { id: 'a', sortOrder: 1, label: 'A', percent: 12.5, triggerType: 'ON_RESERVATION' },
      { id: 'b', sortOrder: 2, label: 'B', percent: 87.5, triggerType: 'ON_HANDOVER' },
    ];
    expect(() => computeSchedule({ priceMinor: 1_000_000, currency: 'USD' }, halves, HANDOVER, START))
      .not.toThrow();
  });

  it('rejects a float price — §4.2 money is integer minor units', () => {
    expect(() => computeSchedule({ priceMinor: 285_000.5, currency: 'USD' }, MILESTONES, HANDOVER, START))
      .toThrow(ScheduleError);
  });

  it('leaves handover-triggered rows undated when handover is unknown', () => {
    const s = computeSchedule({ priceMinor: 28_500_000, currency: 'USD' }, MILESTONES, null, START);
    expect(s.rows[5]!.dueDate).toBeNull();
  });
});
