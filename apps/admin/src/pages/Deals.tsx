import { useState } from 'react';
import { BadgeCheck, CircleDollarSign, FileSignature, Handshake, History, KeyRound, RotateCcw, Search, XCircle } from 'lucide-react';
import { DEAL_STATUS_LABEL, DEAL_STATUS_TONE, LOST_REASON_LABEL, type DealStatusValue, type LostReasonValue } from '@avida/types';
import { get, patch, post, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { refreshCrm, relDay, requestApproval, type Deal } from '../lib/crm';
import { invalidate } from '../lib/query';
import { ApprovalCard } from './Approvals';
import { ago, code as fmtCode, date, dateTime, money } from '../lib/format';
import { useQuery } from '../lib/query';
import { useTeam } from '../lib/ref';
import { Link, useDebounced, useSearchState } from '../lib/router';
import { useToast } from '../components/Toast';
import { LostModal } from '../components/crm';
import { Badge, Button, Card, Drawer, Empty, ErrorBox, Field, Input, KV, Modal, MoneyInput, PageHead, Select, Skeleton, Textarea, useConfirm } from '../components/ui';

interface DealList {
  data: Deal[];
  summary: Record<string, { count: number; valueMinor: number; discountMinor: number }>;
}

const TABS: { value: string; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'NEGOTIATION', label: 'Negotiation' },
  { value: 'RESERVED', label: 'Reserved' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'SOLD', label: 'Sold' },
  { value: 'LOST,CANCELLED', label: 'Lost & cancelled' },
];

export const dealPrice = (d: Pick<Deal, 'agreedPriceMinor' | 'listPriceMinor'>) => d.agreedPriceMinor ?? d.listPriceMinor;

/** Deals: every negotiation on a residence, through reservation and contract to sale. */
export default function Deals() {
  const [s, set] = useSearchState({ status: 'open' });
  const [q, setQ] = useState(s.q ?? '');
  const term = useDebounced(q);
  const { data: team } = useTeam();
  const { can } = useAuth();
  const query = qs({ status: s.status, q: term, agentId: s.agentId });
  const { data, error, refetch } = useQuery(`crm:deals:${query}`, () => get<DealList>(`/admin/crm/deals${query}`));

  return (
    <>
      <PageHead title="Deals" sub="Negotiations, reservations, contracts and sales — each tied to a real residence." />
      <div className="deal-summary">
        {(['NEGOTIATION', 'RESERVED', 'CONTRACT', 'SOLD'] as const).map((st) => (
          <button key={st} type="button" className={`deal-sum tone-border-${DEAL_STATUS_TONE[st]}`} onClick={() => set({ status: st })}>
            <span>{DEAL_STATUS_LABEL[st]}</span>
            <strong className="tabular">{data?.summary[st]?.count ?? '—'}</strong>
            <small className="tabular">{data ? money(data.summary[st]?.valueMinor ?? 0, 'USD', { compact: true }) : ''}</small>
          </button>
        ))}
      </div>
      <Card>
        <div className="view-tabs inset" role="tablist">
          {TABS.map((t) => (
            <button key={t.value} type="button" role="tab" aria-selected={s.status === t.value} onClick={() => set({ status: t.value })}>{t.label}</button>
          ))}
        </div>
        <div className="toolbar">
          <label className="crm-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search deals</span><Input value={q} placeholder="Buyer or residence" onChange={(e) => setQ(e.target.value)} /></label>
          {can('enquiry.view', 'TEAM') && <Select className="sm" style={{ width: 'auto' }} value={s.agentId ?? ''} onChange={(e) => set({ agentId: e.target.value })} placeholder="Every agent" options={[{ value: 'me', label: 'Mine' }, ...(team ?? []).map((t) => ({ value: t.id, label: t.name }))]} />}
        </div>
        {error && <ErrorBox error={error} onRetry={refetch} />}
        {!data && !error && <div className="card-body"><Skeleton h={160} /></div>}
        {data && data.data.length === 0 && <Empty title="No deals here" icon={<Handshake size={30} />}>Open a deal from a lead once they are negotiating on a specific residence.</Empty>}
        {data && data.data.length > 0 && (
          <div className="table-wrap">
            <table className="table crm-cards">
              <thead>
                <tr><th>Buyer</th><th>Residence</th><th>Status</th><th className="num">List</th><th className="num">Agreed</th><th className="num">Discount</th><th>Agent</th><th>Expected close</th><th>Updated</th></tr>
              </thead>
              <tbody>
                {data.data.map((d) => (
                  <tr key={d.id} data-clickable="true" onClick={() => set({ open: d.id }, { replace: false })}>
                    <td data-label="Buyer"><strong>{d.enquiry?.name ?? d.buyer?.fullName ?? '—'}</strong></td>
                    <td data-label="Residence"><strong>{fmtCode(d.unit.code)}</strong> <span className="muted small">{d.unit.typology.name}</span></td>
                    <td data-label="Status"><Badge tone={DEAL_STATUS_TONE[d.status as DealStatusValue]}>{DEAL_STATUS_LABEL[d.status as DealStatusValue]}</Badge></td>
                    <td data-label="List" className="num">{money(d.listPriceMinor, d.currency)}</td>
                    <td data-label="Agreed" className="num">{d.agreedPriceMinor !== null ? money(d.agreedPriceMinor, d.currency) : <span className="faint">list</span>}</td>
                    <td data-label="Discount" className="num">{d.discountMinor ? money(d.discountMinor, d.currency) : '—'}</td>
                    <td data-label="Agent" className="small">{d.agent?.name ?? '—'}</td>
                    <td data-label="Close" className="small">{d.expectedCloseAt ? date(d.expectedCloseAt) : '—'}</td>
                    <td data-label="Updated" className="small muted">{ago(d.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {s.open && <DealDrawer id={s.open} onClose={() => set({ open: null })} />}
    </>
  );
}

export function DealDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: deal, error } = useQuery(`crm:deal:${id}`, () => get<Deal & { history: { id: string; summary: string | null; actorName: string; createdAt: string; action: string }[] }>(`/admin/crm/deals/${id}`));
  return (
    <Drawer title={deal ? `${deal.enquiry?.name ?? 'Deal'} · ${fmtCode(deal.unit.code)}` : 'Deal'} sub={deal && <Badge tone={DEAL_STATUS_TONE[deal.status as DealStatusValue]}>{DEAL_STATUS_LABEL[deal.status as DealStatusValue]}</Badge>} onClose={onClose}>
      {error && <ErrorBox error={error} />}
      {!deal && !error && <Skeleton h={240} />}
      {deal && (
        <div className="stack">
          <DealPanel deal={deal} />
          {deal.enquiry && <Link className="btn" to={`/crm/leads/${deal.enquiry.id}`}>Open the lead</Link>}
          <div>
            <div className="field-label"><History size={14} /> Audit trail</div>
            <ol className="mini-history">
              {deal.history.map((h) => <li key={h.id}><span>{h.summary ?? h.action}</span><small className="muted">{h.actorName} · {dateTime(h.createdAt)}</small></li>)}
              {deal.history.length === 0 && <li className="muted small">No changes yet.</li>}
            </ol>
          </div>
        </div>
      )}
    </Drawer>
  );
}

/** The terms, the stage, and the next move, for one deal. Used on the lead page and in the drawer. */
export function DealPanel({ deal }: { deal: Deal }) {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [reserving, setReserving] = useState(false);
  const [losing, setLosing] = useState(false);
  const open = ['NEGOTIATION', 'RESERVED', 'CONTRACT'].includes(deal.status);
  const act = async (action: string, body: Record<string, unknown> = {}, msg = 'Saved.') => {
    try {
      await post(`/admin/crm/deals/${deal.id}/action`, { action, ...body });
      toast.success(msg);
      refreshCrm();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  /** When the person may not take a step, the same button asks someone who may. */
  const ask = async (action: string, body: Record<string, unknown> = {}, note?: string) => {
    try {
      await requestApproval(deal.id, { operation: 'action', action: { action, ...body }, note });
      toast.success('Sent for approval. You will be notified of the decision.');
      invalidate('approvals', 'crm');
      refreshCrm();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const pending = (deal.approvals ?? []).filter((a) => a.status === 'PENDING');
  const waiting = (kind: string) => pending.some((a) => a.kind === kind);
  const steps = ['NEGOTIATION', 'RESERVED', 'CONTRACT', 'SOLD'];
  const at = steps.indexOf(deal.status);
  return (
    <div className="deal-panel">
      <div className="deal-steps" aria-label="Deal progress">
        {steps.map((st, i) => <span key={st} className={i < at ? 'done' : i === at ? 'current' : ''}>{DEAL_STATUS_LABEL[st as DealStatusValue]}</span>)}
      </div>
      <div className="deal-figures">
        <div><span>List price</span><strong className="tabular">{money(deal.listPriceMinor, deal.currency)}</strong></div>
        <div><span>Agreed</span><strong className="tabular">{money(dealPrice(deal), deal.currency)}</strong></div>
        <div><span>Discount</span><strong className="tabular">{deal.discountMinor ? `${money(deal.discountMinor, deal.currency)} (${((deal.discountMinor / deal.listPriceMinor) * 100).toFixed(1)}%)` : '—'}</strong></div>
        <div><span>Reservation</span><strong className="tabular" title={deal.financeHidden ? 'Financial details need the “View financial details” permission.' : undefined}>{deal.financeHidden ? 'Restricted' : deal.reservationAmountMinor ? money(deal.reservationAmountMinor, deal.currency) : '—'}</strong></div>
      </div>
      <KV
        items={[
          ['Residence', <Link to={`/residences/${deal.unit.id}`}>{fmtCode(deal.unit.code)} · {deal.unit.typology.name} · {Math.round(deal.unit.areaSqm)} m² · floor {deal.unit.floor.label}</Link>],
          ['Payment plan', deal.paymentPlan?.name ?? '—'],
          ['Agent', deal.agent?.name ?? '—'],
          ['Expected close', deal.expectedCloseAt ? date(deal.expectedCloseAt) : '—'],
          ...(deal.reservation ? ([['Hold', `${deal.reservation.status === 'ACTIVE' ? `Until ${relDay(deal.reservation.heldUntil, false)}` : deal.reservation.status.toLowerCase()}${deal.reservation.depositReceivedAt ? ' · deposit received' : ''}`]] as [string, string][]) : []),
          ...(deal.lostReason ? ([['Lost because', `${LOST_REASON_LABEL[deal.lostReason as LostReasonValue]}${deal.lostNote ? ` — ${deal.lostNote}` : ''}`]] as [string, string][]) : []),
        ]}
      />
      {deal.notes && <p className="quote">{deal.notes}</p>}
      {pending.map((a) => <ApprovalCard key={a.id} a={a} compact />)}
      {can('deal.edit') && (
        <div className="row-wrap deal-actions">
          {open && <Button size="sm" icon={<CircleDollarSign size={14} />} onClick={() => setEditing(true)}>Edit terms</Button>}
          {deal.status === 'NEGOTIATION' && (can('reservation.edit') || !waiting('RESERVATION')) && <Button size="sm" variant="primary" icon={<KeyRound size={14} />} onClick={() => setReserving(true)}>{can('reservation.edit') ? 'Reserve residence' : 'Request reservation'}</Button>}
          {deal.status === 'RESERVED' && <Button size="sm" variant="primary" icon={<FileSignature size={14} />} onClick={() => void act('contract', {}, 'Moved to contract.')}>Move to contract</Button>}
          {open && can('deal.close') && (
            <Button size="sm" variant={deal.status === 'CONTRACT' ? 'primary' : 'default'} icon={<BadgeCheck size={14} />} onClick={async () => {
              if (await confirm({ title: `Mark ${fmtCode(deal.unit.code)} sold?`, body: `The residence becomes sold on the website at ${money(dealPrice(deal), deal.currency)}. Other open deals on it are closed as lost.`, confirm: 'Mark sold' })) void act('sold', {}, 'Sale closed. Congratulations!');
            }}>Mark sold</Button>
          )}
          {open && !can('deal.close') && !waiting('DEAL_CLOSE') && (
            <Button size="sm" variant={deal.status === 'CONTRACT' ? 'primary' : 'default'} icon={<BadgeCheck size={14} />} onClick={async () => {
              if (await confirm({ title: `Ask to close ${fmtCode(deal.unit.code)} as sold?`, body: `A manager approves the sale at ${money(dealPrice(deal), deal.currency)}. Nothing changes until they do.`, confirm: 'Request approval' })) void ask('sold');
            }}>Request to close</Button>
          )}
          {open && <Button size="sm" variant="ghost" icon={<XCircle size={14} />} onClick={() => setLosing(true)}>Lost</Button>}
          {!open && deal.status !== 'SOLD' && <Button size="sm" icon={<RotateCcw size={14} />} onClick={() => void act('reopen', {}, 'Deal reopened.')}>Reopen</Button>}
        </div>
      )}
      {editing && <DealTermsModal deal={deal} onClose={() => setEditing(false)} />}
      {reserving && <ReserveModal deal={deal} request={!can('reservation.edit')} onClose={() => setReserving(false)} onReserve={(body) => { setReserving(false); if (can('reservation.edit')) void act('reserve', body, `${fmtCode(deal.unit.code)} reserved — the website shows it as booked.`); else void ask('reserve', body, (body.note as string | undefined) || undefined); }} />}
      {losing && <LostModal title="Close the deal as lost" onClose={() => setLosing(false)} onConfirm={(reason, note) => {
        setLosing(false);
        // Releasing an active hold is a reservation decision; without it the loss goes for approval.
        if (deal.reservation?.status === 'ACTIVE' && !can('reservation.edit')) void ask('lost', { lostReason: reason, note: note || undefined }, note || undefined);
        else void act('lost', { lostReason: reason, note: note || undefined }, 'Deal closed as lost.');
      }} />}
    </div>
  );
}

function DealTermsModal({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data: plans } = useQuery('payment-plans', () => get<{ id: string; name: string }[]>('/admin/payment-plans'));
  const [d, setD] = useState({ agreedPriceMinor: deal.agreedPriceMinor, reservationAmountMinor: deal.reservationAmountMinor, paymentPlanId: deal.paymentPlan?.id ?? '', expectedCloseAt: deal.expectedCloseAt?.slice(0, 10) ?? '', notes: deal.notes ?? '', reason: '' });
  const priceChanged = d.agreedPriceMinor !== deal.agreedPriceMinor && d.agreedPriceMinor !== null;
  // Without `deal.price`, a new price is a request for a manager, not an edit.
  const needsApproval = priceChanged && !can('deal.price');
  const save = async () => {
    try {
      await patch(`/admin/crm/deals/${deal.id}`, {
        ...(can('deal.price') && d.agreedPriceMinor !== deal.agreedPriceMinor ? { agreedPriceMinor: d.agreedPriceMinor } : {}),
        // A withheld amount is shown as empty; never write that emptiness back.
        ...(!deal.financeHidden ? { reservationAmountMinor: d.reservationAmountMinor } : {}),
        paymentPlanId: d.paymentPlanId || null,
        expectedCloseAt: d.expectedCloseAt ? new Date(`${d.expectedCloseAt}T12:00:00`).toISOString() : null,
        notes: d.notes || null,
      });
      if (needsApproval) {
        await requestApproval(deal.id, { operation: 'update', fields: { agreedPriceMinor: d.agreedPriceMinor }, note: d.reason || undefined });
        toast.success('Terms saved. The price was sent to a manager for approval.');
        invalidate('approvals');
      } else {
        toast.success('Deal updated. Price changes are in the audit trail.');
      }
      refreshCrm();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const discount = d.agreedPriceMinor !== null ? deal.listPriceMinor - d.agreedPriceMinor : null;
  return (
    <Modal title="Deal terms" sub={`${fmtCode(deal.unit.code)} · list ${money(deal.listPriceMinor, deal.currency)}`} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => void save()}>Save</Button></>}>
      <div className="grid-2">
        <Field label="Agreed price" hint={can('deal.price') ? (discount ? `Discount ${money(discount, deal.currency)}` : 'Empty = list price') : needsApproval ? `Needs approval${discount && discount > 0 ? ` — a discount of ${money(discount, deal.currency)}` : ''}.` : 'A new price is sent to a manager for approval.'}>
          <MoneyInput value={d.agreedPriceMinor} onChange={(v) => setD({ ...d, agreedPriceMinor: v })} />
        </Field>
        <Field label="Reservation amount" hint={deal.financeHidden ? 'Restricted to finance and managers.' : undefined}><MoneyInput value={deal.financeHidden ? null : d.reservationAmountMinor} disabled={deal.financeHidden} onChange={(v) => setD({ ...d, reservationAmountMinor: v })} /></Field>
        <Field label="Payment plan"><Select value={d.paymentPlanId} onChange={(e) => setD({ ...d, paymentPlanId: e.target.value })} placeholder="Not chosen" options={(plans ?? []).map((p) => ({ value: p.id, label: p.name }))} /></Field>
        <Field label="Expected close"><Input type="date" value={d.expectedCloseAt} onChange={(e) => setD({ ...d, expectedCloseAt: e.target.value })} /></Field>
      </div>
      {needsApproval && <Field label="Why this price?" hint="Shown to the approver."><Input value={d.reason} onChange={(e) => setD({ ...d, reason: e.target.value })} placeholder="Cash buyer, closing this month" /></Field>}
      <Field label="Notes"><Textarea rows={3} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></Field>
    </Modal>
  );
}

function ReserveModal({ deal, request, onClose, onReserve }: { deal: Deal; request?: boolean; onClose: () => void; onReserve: (body: Record<string, unknown>) => void }) {
  const inTwoWeeks = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const [d, setD] = useState({ heldUntil: inTwoWeeks, depositMinor: deal.reservationAmountMinor, note: '' });
  return (
    <Modal title={request ? `Request a reservation of ${fmtCode(deal.unit.code)}` : `Reserve ${fmtCode(deal.unit.code)}`} sub={request ? 'A manager approves the hold. Until then the residence stays available.' : 'The residence is held for this buyer and shows as booked on the website. Only one hold per residence is ever possible.'} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={<KeyRound size={15} />} onClick={() => onReserve({ heldUntil: new Date(`${d.heldUntil}T23:59:00`).toISOString(), ...(deal.financeHidden && d.depositMinor === null ? {} : { depositMinor: d.depositMinor }), note: d.note || undefined })}>{request ? 'Request approval' : 'Reserve'}</Button></>}>
      <div className="grid-2">
        <Field label="Hold until"><Input type="date" value={d.heldUntil} onChange={(e) => setD({ ...d, heldUntil: e.target.value })} /></Field>
        <Field label="Deposit"><MoneyInput value={d.depositMinor} onChange={(v) => setD({ ...d, depositMinor: v })} /></Field>
      </div>
      <Field label="Note"><Textarea rows={2} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} /></Field>
    </Modal>
  );
}
