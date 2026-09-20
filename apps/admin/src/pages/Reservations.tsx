import { useState } from 'react';
import { BadgeCheck, CalendarClock, KeyRound, Plus, XCircle } from 'lucide-react';
import { DEFAULT_HOLD_DAYS, RESERVATION_STATUS_LABEL } from '@avida/types';
import { get, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { code as fmtCode, date, money } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { floorName, useTeam } from '../lib/ref';
import { Link, useSearchState } from '../lib/router';
import type { Paged, ResidenceRow } from '../lib/types';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, LoadingPage, Modal, MoneyInput, PageHead, Select, Stat, Tabs, Textarea, useConfirm } from '../components/ui';

interface Reservation {
  id: string;
  status: keyof typeof RESERVATION_STATUS_LABEL;
  heldUntil: string;
  hoursLeft: number | null;
  depositMinor: number | null;
  currency: string;
  depositReceivedAt: string | null;
  notes: string | null;
  createdAt: string;
  closedAt: string | null;
  closedReason: string | null;
  unit: { id: string; code: string; status: string; priceMinor: number; currency: string; floor: { label: string; displayName: string | null } };
  buyer: { id: string; fullName: string } | null;
  enquiry: { id: string; name: string } | null;
  agent: { id: string; name: string } | null;
}

interface ListData {
  data: Reservation[];
  counts: Record<string, number>;
  depositsHeldMinor: number;
}

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/** Place a hold on an available residence (from a lead, or directly). */
export function ReservationForm({ unitId, enquiryId, onClose }: { unitId?: string; enquiryId?: string; onClose: () => void }) {
  const toast = useToast();
  const { data: team } = useTeam();
  const { user } = useAuth();
  const { data: available } = useQuery('residences:available-for-hold', () => get<Paged<ResidenceRow>>('/admin/residences?status=AVAILABLE&pageSize=500'));
  const [d, setD] = useState({ unitId: unitId ?? '', heldUntil: inDays(DEFAULT_HOLD_DAYS), depositMinor: null as number | null, agentId: user?.id ?? '', notes: '' });
  const unit = available?.data.find((u) => u.id === d.unitId);
  const save = async () => {
    try {
      await post('/admin/reservations', { unitId: d.unitId, enquiryId, heldUntil: new Date(`${d.heldUntil}T23:59:00`).toISOString(), depositMinor: d.depositMinor, agentId: d.agentId || null, notes: d.notes || null });
      toast.success('Reserved. The website shows the residence as reserved.');
      invalidate('reservations', 'residences', 'enquiries', 'dashboard', 'sales-desk');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Modal title="Reserve a residence" sub="The residence goes on hold at once and returns to sale automatically if the hold lapses." onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!d.unitId || !d.heldUntil} onClick={() => void save()}>Place hold</Button></>}>
      <Field label="Residence">
        <Select value={d.unitId} onChange={(e) => setD({ ...d, unitId: e.target.value })} placeholder="Choose an available residence" options={(available?.data ?? []).map((u) => ({ value: u.id, label: `${fmtCode(u.code)} — ${money(u.effectivePriceMinor, u.currency)}` }))} />
      </Field>
      <div className="grid-2">
        <Field label="Held until"><Input type="date" min={inDays(0)} value={d.heldUntil} onChange={(e) => setD({ ...d, heldUntil: e.target.value })} /></Field>
        <Field label="Deposit"><MoneyInput value={d.depositMinor} currency={unit?.currency ?? 'USD'} onChange={(v) => setD({ ...d, depositMinor: v })} /></Field>
        <Field label="Agent"><Select value={d.agentId} onChange={(e) => setD({ ...d, agentId: e.target.value })} placeholder="Unassigned" options={(team ?? []).map((t) => ({ value: t.id, label: t.name }))} /></Field>
      </div>
      <Field label="Notes"><Textarea rows={2} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></Field>
    </Modal>
  );
}

/** Audit §12 — reservations as records: holds, deposits, expiries, outcomes. */
export default function Reservations() {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [s, set] = useSearchState({ tab: 'ACTIVE' });
  const { data, error, refetch } = useQuery(`reservations:${s.tab}`, () => get<ListData>(`/admin/reservations?status=${s.tab}`));
  const [creating, setCreating] = useState(false);
  const [extend, setExtend] = useState<Reservation | null>(null);
  const [extendTo, setExtendTo] = useState('');
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data) return <LoadingPage />;
  const editable = can('reservation.edit');
  const refresh = () => invalidate('reservations', 'residences', 'enquiries', 'dashboard', 'sales-desk');
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast.success(msg);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const expiringSoon = data.data.filter((r) => r.status === 'ACTIVE' && (r.hoursLeft ?? 999) <= 48).length;

  return (
    <>
      <PageHead title="Reservations" sub="Holds on residences, with their deposits and expiry">
        {editable && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreating(true)}>Reserve a residence</Button>}
      </PageHead>
      <div className="grid-3">
        <Stat label="Held now" value={data.counts.ACTIVE ?? 0} icon={<KeyRound size={18} />} tone="orange" />
        <Stat label="Lapsing within 48 h" value={expiringSoon} icon={<CalendarClock size={18} />} tone={expiringSoon ? 'red' : 'grey'} />
        <Stat label="Deposits received on active holds" value={money(data.depositsHeldMinor, data.data[0]?.currency ?? 'USD')} icon={<BadgeCheck size={18} />} tone="green" />
      </div>
      <Card>
        <Tabs value={s.tab as 'ACTIVE'} onChange={(v) => set({ tab: v })} tabs={(['ACTIVE', 'CONVERTED', 'EXPIRED', 'CANCELLED'] as const).map((t) => ({ value: t, label: RESERVATION_STATUS_LABEL[t], count: data.counts[t] ?? 0 }))} />
        {data.data.length === 0 && <Empty title="Nothing here" icon={<KeyRound size={28} />} />}
        {data.data.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Residence</th>
                  <th>For</th>
                  <th>Held until</th>
                  <th className="num">Deposit</th>
                  <th>Agent</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {data.data.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/residences/${r.unit.id}`}><strong>{fmtCode(r.unit.code)}</strong></Link>
                      <div className="muted small">{floorName(r.unit.floor)} · {money(r.unit.priceMinor, r.unit.currency)}</div>
                    </td>
                    <td className="small">{r.buyer ? <Link to={`/buyers/${r.buyer.id}`}>{r.buyer.fullName}</Link> : r.enquiry ? <Link to={`/enquiries?open=${r.enquiry.id}`}>{r.enquiry.name}</Link> : <span className="faint">—</span>}</td>
                    <td className="small">
                      {date(r.heldUntil)}
                      {r.status === 'ACTIVE' && r.hoursLeft !== null && (
                        <div><Badge tone={r.hoursLeft <= 48 ? 'red' : 'grey'} plain>{r.hoursLeft <= 0 ? 'lapsing now' : r.hoursLeft < 48 ? `${r.hoursLeft} h left` : `${Math.round(r.hoursLeft / 24)} days left`}</Badge></div>
                      )}
                      {r.closedAt && <div className="muted">{RESERVATION_STATUS_LABEL[r.status]} {date(r.closedAt)}</div>}
                    </td>
                    <td className="num small">
                      {r.depositMinor ? money(r.depositMinor, r.currency) : '—'}
                      {r.depositMinor ? <div>{r.depositReceivedAt ? <Badge tone="green" plain>Received</Badge> : <Badge tone="amber" plain>Awaited</Badge>}</div> : null}
                    </td>
                    <td className="small">{r.agent?.name ?? '—'}</td>
                    <td className="actions">
                      {editable && r.status === 'ACTIVE' && (
                        <span className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                          {r.depositMinor && !r.depositReceivedAt && <Button size="sm" onClick={() => void act(() => patch(`/admin/reservations/${r.id}`, { depositReceivedAt: new Date().toISOString() }), 'Deposit recorded.')}>Deposit received</Button>}
                          <Button size="sm" onClick={() => { setExtend(r); setExtendTo(new Date(new Date(r.heldUntil).getTime() + 7 * 86_400_000).toISOString().slice(0, 10)); }}>Extend</Button>
                          <Button size="sm" variant="primary" icon={<BadgeCheck size={14} />} onClick={async () => { if (await confirm({ title: `Convert ${fmtCode(r.unit.code)} to a sale?`, body: 'The residence is marked sold everywhere, including the website.', confirm: 'Mark as sold' })) void act(() => post(`/admin/reservations/${r.id}/close`, { action: 'convert' }), 'Converted to a sale.'); }}>Sold</Button>
                          <Button size="sm" variant="ghost" icon={<XCircle size={14} />} aria-label="Cancel reservation" onClick={async () => { if (await confirm({ title: `Release ${fmtCode(r.unit.code)}?`, body: 'The hold ends and the residence returns to sale.', confirm: 'Release', danger: true })) void act(() => post(`/admin/reservations/${r.id}/close`, { action: 'cancel' }), 'Released — back on sale.'); }} />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {creating && <ReservationForm onClose={() => setCreating(false)} />}
      {extend && (
        <Modal title={`Extend the hold on ${fmtCode(extend.unit.code)}`} onClose={() => setExtend(null)} footer={<><Button onClick={() => setExtend(null)}>Cancel</Button><Button variant="primary" onClick={() => { void act(() => patch(`/admin/reservations/${extend.id}`, { heldUntil: new Date(`${extendTo}T23:59:00`).toISOString() }), 'Hold extended.'); setExtend(null); }}>Extend</Button></>}>
          <Field label="Held until"><Input type="date" value={extendTo} min={inDays(0)} onChange={(e) => setExtendTo(e.target.value)} /></Field>
        </Modal>
      )}
    </>
  );
}
