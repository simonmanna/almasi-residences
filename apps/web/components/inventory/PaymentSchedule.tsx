'use client';

import { formatDate, formatMoney, formatPercent } from '@avida/types';
import type { ScheduleRowDto } from '../../lib/api';

/**
 * §9 Phase 1 task 6 — the payment schedule. The arithmetic is done once, in the
 * shared pure function (§5.6 / DECISIONS D-04); this only renders it. Every
 * figure is tabular so the column aligns.
 */
export function PaymentSchedule({
  rows,
  cumulative,
  totalMinor,
  currency,
}: {
  rows: ScheduleRowDto[];
  cumulative: number[];
  totalMinor: number;
  currency: string;
}) {
  return (
    <table className="table schedule">
      <caption className="visually-hidden">Payment schedule</caption>
      <thead>
        <tr>
          <th scope="col">Milestone</th>
          <th scope="col">When</th>
          <th scope="col" className="align-right">
            Share
          </th>
          <th scope="col" className="align-right">
            Amount
          </th>
          <th scope="col" className="align-right">
            Paid to date
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.milestoneId}>
            <th scope="row" className="schedule-label">
              {row.label}
            </th>
            <td>
              {row.dueDate ? (
                formatDate(row.dueDate)
              ) : (
                // §5.6 rule 4 — a construction-stage milestone with no date
                // shows its wording. A guessed date would be a promise.
                <span className="muted">{row.triggerNote ?? 'On completion'}</span>
              )}
            </td>
            <td data-numeric className="align-right">
              {formatPercent(row.percent)}
            </td>
            <td data-numeric className="align-right">
              {formatMoney({ amountMinor: row.amountMinor, currency })}
            </td>
            <td data-numeric className="align-right muted">
              {formatMoney({ amountMinor: cumulative[i] ?? 0, currency })}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" colSpan={3}>
            Total
          </th>
          <td data-numeric className="align-right">
            {formatMoney({ amountMinor: totalMinor, currency })}
          </td>
          <td />
        </tr>
      </tfoot>
    </table>
  );
}
