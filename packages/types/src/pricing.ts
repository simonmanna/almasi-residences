/**
 * §5.6 — payment schedule computation. Pure, deterministic, no I/O, no LLM,
 * ever. Lives in a shared package so the API and the web calculator cannot
 * drift apart: one implementation, one test suite, two consumers.
 */

export type MilestoneTrigger =
  | 'ON_RESERVATION'
  | 'ON_SIGNING'
  | 'ON_DATE'
  | 'ON_CONSTRUCTION_STAGE'
  | 'ON_HANDOVER';

export interface PaymentMilestoneInput {
  id: string;
  sortOrder: number;
  label: string;
  percent: number;
  triggerType: MilestoneTrigger;
  triggerDate?: Date | null;
  triggerNote?: string | null;
}

export interface ScheduleRow {
  milestoneId: string;
  sortOrder: number;
  label: string;
  percent: number;
  amountMinor: number;
  /** null when the trigger is a construction stage with no fixed date yet — show triggerNote instead. */
  dueDate: Date | null;
  triggerType: MilestoneTrigger;
  triggerNote: string | null;
}

export interface Schedule {
  totalMinor: number;
  currency: string;
  rows: ScheduleRow[];
  /** Running total, same order as rows. Drives the schedule chart. */
  cumulative: number[];
}

export class ScheduleError extends Error {}

const DAY_MS = 86_400_000;
/** §5.6 rule 4 — signing follows reservation by two weeks. */
const SIGNING_OFFSET_DAYS = 14;

function dueDateFor(
  m: PaymentMilestoneInput,
  startDate: Date,
  handoverDate: Date | null,
): Date | null {
  switch (m.triggerType) {
    case 'ON_RESERVATION':
      return startDate;
    case 'ON_SIGNING':
      return new Date(startDate.getTime() + SIGNING_OFFSET_DAYS * DAY_MS);
    case 'ON_DATE':
      return m.triggerDate ?? null;
    case 'ON_HANDOVER':
      return handoverDate;
    case 'ON_CONSTRUCTION_STAGE':
      // No invented date. The UI renders triggerNote ("On completion of the
      // 5th slab") where the date would go — a guessed date is a promise.
      return m.triggerDate ?? null;
  }
}

/**
 * Percentages must sum to exactly 100 (§5.6 rule 5). Fractional milestones are
 * allowed, so compare in basis points to avoid float noise: 12.5 + 87.5 must
 * pass, 33.33 × 3 must fail loudly rather than silently losing a cent.
 */
export function assertPercentagesSumTo100(milestones: PaymentMilestoneInput[]): void {
  const bps = milestones.reduce((acc, m) => acc + Math.round(m.percent * 100), 0);
  if (bps !== 10_000) {
    throw new ScheduleError(
      `Payment milestones must sum to exactly 100%, got ${(bps / 100).toFixed(2)}%`,
    );
  }
}

export function computeSchedule(
  unit: { priceMinor: number; currency: string },
  milestones: PaymentMilestoneInput[],
  handoverDate: Date | null,
  startDate: Date = new Date(),
): Schedule {
  if (!Number.isInteger(unit.priceMinor)) {
    throw new ScheduleError('priceMinor must be an integer in minor units (§4.2)');
  }
  if (unit.priceMinor < 0) throw new ScheduleError('priceMinor must not be negative');
  if (milestones.length === 0) throw new ScheduleError('At least one milestone is required');
  assertPercentagesSumTo100(milestones);

  const ordered = [...milestones].sort((a, b) => a.sortOrder - b.sortOrder);

  const rows: ScheduleRow[] = ordered.map((m) => ({
    milestoneId: m.id,
    sortOrder: m.sortOrder,
    label: m.label,
    percent: m.percent,
    amountMinor: Math.round((unit.priceMinor * m.percent) / 100),
    dueDate: dueDateFor(m, startDate, handoverDate),
    triggerType: m.triggerType,
    triggerNote: m.triggerNote ?? null,
  }));

  // §5.6 rule 3 — the rounding residue goes to the final row, so the schedule
  // sums to the price exactly. Without this, a 33.33% split loses a cent and
  // the buyer's total does not match the headline price.
  const summed = rows.reduce((acc, r) => acc + r.amountMinor, 0);
  const residue = unit.priceMinor - summed;
  const last = rows[rows.length - 1];
  if (last) last.amountMinor += residue;

  let running = 0;
  const cumulative = rows.map((r) => (running += r.amountMinor));

  return { totalMinor: unit.priceMinor, currency: unit.currency, rows, cumulative };
}
