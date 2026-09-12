import { isSaleReversal, STATUS_LABEL, UNIT_STATUSES, type UnitStatus } from '@avida/types';
import { post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { STATUS_TONE } from '../lib/format';
import { invalidate } from '../lib/query';
import { useToast } from './Toast';
import { StatusBadge, useConfirm } from './ui';

/**
 * §25 — change a residence's status where it is shown. Moving to Sold, or
 * undoing a sale, asks first; undoing a sale is offered only to roles the API
 * would allow (D-34).
 */
export function StatusSelect({ id, code, status, onChanged, disabled }: { id: string; code: string; status: UnitStatus; onChanged?: () => void; disabled?: boolean }) {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  if (!can('residence.status') || disabled) return <StatusBadge status={status} />;
  const reverse = can('residence.reverse-sale');

  const change = async (to: UnitStatus) => {
    if (to === status) return;
    if (to === 'SOLD' || isSaleReversal(status, to)) {
      const ok = await confirm({
        title: to === 'SOLD' ? `Mark ${code} as sold?` : `Undo the sale of ${code}?`,
        body:
          to === 'SOLD'
            ? 'The website will show it as sold straight away, and only a super admin can undo this.'
            : `It will show as ${STATUS_LABEL[to].toLowerCase()} on the website again. The change is recorded in the audit log.`,
        confirm: to === 'SOLD' ? 'Mark as sold' : 'Undo sale',
        danger: to !== 'SOLD',
      });
      if (!ok) return;
    }
    try {
      await post(`/admin/residences/${id}/status`, { status: to });
      toast.success(`${code.replace(/-/g, ' ')} is now ${STATUS_LABEL[to].toLowerCase()}.`);
      invalidate('residences', 'residence:', 'dashboard', 'building', 'floors', 'floor:', 'search:');
      onChanged?.();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <select
      className={`status-select tone-${STATUS_TONE[status]}`}
      value={status}
      aria-label={`Status of ${code}`}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => void change(e.target.value as UnitStatus)}
    >
      {UNIT_STATUSES.map((s) => (
        <option key={s} value={s} disabled={!reverse && isSaleReversal(status, s)}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}
