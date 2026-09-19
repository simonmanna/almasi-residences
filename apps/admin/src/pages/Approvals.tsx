import { useState } from 'react';
import { BadgeCheck, Check, Undo2, X } from 'lucide-react';
import { get, post } from '../lib/api';
import { refreshCrm, type Approval } from '../lib/crm';
import { ago, code as fmtCode, dateTime, money } from '../lib/format';
import { useQuery } from '../lib/query';
import { Link } from '../lib/router';
import { useToast } from '../components/Toast';
import { Button, Card, Empty, ErrorBox, Field, Modal, PageHead, Segmented, Skeleton, Textarea } from '../components/ui';

const STATUS_TEXT: Record<Approval['status'], string> = { PENDING: 'Waiting', APPROVED: 'Approved', REJECTED: 'Rejected', CANCELLED: 'Withdrawn' };

/**
 * One request: what was asked, by whom, and — for someone who may decide —
 * Approve / Reject. Approving applies the change as the approver, with every
 * normal check; the decision is written to the audit log.
 */
export function ApprovalCard({ a, compact }: { a: Approval; compact?: boolean }) {
  const toast = useToast();
  const [deciding, setDeciding] = useState<'approve' | 'reject' | null>(null);
  const requested = typeof a.payload.agreedPriceMinor === 'number' ? (a.payload.agreedPriceMinor as number) : null;
  const decide = async (decision: 'approve' | 'reject', note: string) => {
    try {
      await post(`/admin/crm/deals/approvals/${a.id}/decide`, { decision, note: note || undefined });
      toast.success(a.mine && decision === 'reject' ? 'Request withdrawn.' : decision === 'approve' ? 'Approved and applied.' : 'Rejected. The requester has been told.');
      refreshCrm();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div className="approval" style={compact ? { padding: '12px 0', borderTop: '1px solid var(--line-2)' } : undefined}>
      <div style={{ minWidth: 0 }}>
        <div className="kind">{a.kindLabel}{a.status !== 'PENDING' && ` · ${STATUS_TEXT[a.status]}`}</div>
        <h3>{a.deal ? <Link to={a.deal.enquiry ? `/crm/leads/${a.deal.enquiry.id}` : `/crm/deals?deal=${a.deal.id}`}>{a.deal.enquiry?.name ?? 'Deal'} · {fmtCode(a.deal.unit.code)}</Link> : a.summary}</h3>
        <div className="small muted">Requested by {a.mine ? 'you' : a.requestedBy.name} · <span title={dateTime(a.createdAt)}>{ago(a.createdAt)}</span></div>
        {a.deal && (
          <div className="figs">
            <span>List <strong>{money(a.deal.listPriceMinor, a.deal.currency)}</strong></span>
            {requested !== null && <span>Requested <strong>{money(requested, a.deal.currency)}</strong></span>}
            {requested !== null && requested < a.deal.listPriceMinor && <span>Discount <strong>{money(a.deal.listPriceMinor - requested, a.deal.currency)} ({(((a.deal.listPriceMinor - requested) / a.deal.listPriceMinor) * 100).toFixed(1)}%)</strong></span>}
          </div>
        )}
        {!a.deal && <div className="small">{a.summary}</div>}
        {a.note && <div className="note">“{a.note}”</div>}
        {a.decisionNote && <div className="note">{a.decidedBy?.name}: “{a.decisionNote}”</div>}
        {a.error && a.status === 'PENDING' && <div className="small" style={{ color: 'var(--red)', marginTop: 6 }}>Last attempt failed: {a.error}</div>}
      </div>
      {a.status === 'PENDING' && (
        <div className="approval-actions">
          {a.canDecide && (
            <>
              <Button size="sm" icon={<X size={14} />} onClick={() => setDeciding('reject')}>Reject</Button>
              <Button size="sm" variant="primary" icon={<Check size={14} />} onClick={() => setDeciding('approve')}>Approve</Button>
            </>
          )}
          {a.mine && <Button size="sm" variant="ghost" icon={<Undo2 size={14} />} onClick={() => void decide('reject', '')}>Withdraw</Button>}
          {!a.canDecide && !a.mine && <span className="small muted">Waiting for a decision</span>}
        </div>
      )}
      {deciding && <DecisionModal a={a} decision={deciding} onClose={() => setDeciding(null)} onConfirm={(note) => { setDeciding(null); void decide(deciding, note); }} />}
    </div>
  );
}

function DecisionModal({ a, decision, onClose, onConfirm }: { a: Approval; decision: 'approve' | 'reject'; onClose: () => void; onConfirm: (note: string) => void }) {
  const [note, setNote] = useState('');
  return (
    <Modal title={`${decision === 'approve' ? 'Approve' : 'Reject'} ${a.kindLabel.toLowerCase()}?`} sub={a.summary} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant={decision === 'approve' ? 'primary' : 'danger'} onClick={() => onConfirm(note)}>{decision === 'approve' ? 'Approve and apply' : 'Reject'}</Button></>}>
      <p className="small muted" style={{ marginTop: 0 }}>{decision === 'approve' ? 'The change is applied now, in your name, with the usual checks. It is recorded in the audit log.' : `${a.requestedBy.name} is told it was rejected.`}</p>
      <Field label={decision === 'approve' ? 'Note (optional)' : 'Reason'}><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={decision === 'approve' ? 'Approved for this buyer only.' : 'Discount too deep this early in the launch.'} /></Field>
    </Modal>
  );
}

/** Discounts, reservations and sales waiting for someone who may decide them. */
export default function Approvals() {
  const [status, setStatus] = useState<'pending' | 'all'>('pending');
  const { data, error, refetch } = useQuery(`approvals:${status}`, () => get<Approval[]>(`/admin/crm/deals/approvals?status=${status}`));
  const decidable = (data ?? []).filter((a) => a.canDecide);
  const mine = (data ?? []).filter((a) => a.mine);
  const others = (data ?? []).filter((a) => !a.canDecide && !a.mine);
  return (
    <>
      <PageHead title="Approvals" sub="Discounts, price changes, reservations and sales that need someone with the authority to decide. Nobody approves their own request.">
        <Segmented value={status} onChange={setStatus} options={[{ value: 'pending', label: 'Waiting' }, { value: 'all', label: 'History' }]} />
      </PageHead>
      {error && <ErrorBox error={error} onRetry={refetch} />}
      {!data && !error && <Skeleton h={180} />}
      {data && !data.length && <Card><Empty title={status === 'pending' ? 'Nothing waiting for a decision' : 'No requests yet'} icon={<BadgeCheck size={26} />}>When someone asks for a discount, a reservation or to close a sale, it appears here.</Empty></Card>}
      {decidable.length > 0 && (
        <Card>
          <div className="card-head"><h2>For you to decide</h2></div>
          {decidable.map((a) => <ApprovalCard key={a.id} a={a} />)}
        </Card>
      )}
      {mine.length > 0 && (
        <Card>
          <div className="card-head"><h2>Your requests</h2></div>
          {mine.map((a) => <ApprovalCard key={a.id} a={a} />)}
        </Card>
      )}
      {others.length > 0 && (
        <Card>
          <div className="card-head"><h2>{status === 'pending' ? 'Waiting on others' : 'Decided'}</h2></div>
          {others.map((a) => <ApprovalCard key={a.id} a={a} />)}
        </Card>
      )}
    </>
  );
}
