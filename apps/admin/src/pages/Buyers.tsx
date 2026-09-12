import { useEffect, useState } from 'react';
import { ChevronRight, Handshake, Plus } from 'lucide-react';
import { BUYER_STAGES, humanise } from '@avida/types';
import { get, patch, post, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago, code as fmtCode, STAGE_TONE } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { useTeam } from '../lib/ref';
import { navigate, useDebounced, useSearchState } from '../lib/router';
import type { Paged } from '../lib/types';
import { useToast } from '../components/Toast';
import { Alert, Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHead, Pagination, Select, Skeleton, Textarea } from '../components/ui';

export interface BuyerRow {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  countryIso: string | null;
  stage: string;
  source: string | null;
  notes: string | null;
  assignedToId: string | null;
  archivedAt: string | null;
  updatedAt: string;
  units: { id: string; code: string; status: string }[];
  interests: { id: string; code: string }[];
  assignedTo: { id: string; name: string } | null;
  enquiryCount: number;
}

export function BuyerForm({ buyer, onClose, onSaved }: { buyer?: Omit<BuyerRow, 'units' | 'interests' | 'enquiryCount'>; onClose: () => void; onSaved?: (id: string) => void }) {
  const toast = useToast();
  const { data: team } = useTeam();
  const [d, setD] = useState({
    fullName: buyer?.fullName ?? '',
    email: buyer?.email ?? '',
    phone: buyer?.phone ?? '',
    countryIso: buyer?.countryIso ?? '',
    stage: buyer?.stage ?? 'PROSPECT',
    source: buyer?.source ?? '',
    assignedToId: buyer?.assignedToId ?? '',
    notes: buyer?.notes ?? '',
  });
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    try {
      const body = { ...d, email: d.email || null, phone: d.phone || null, countryIso: d.countryIso || null, source: d.source || null, assignedToId: d.assignedToId || null, notes: d.notes || null };
      const saved = buyer ? await patch<{ id: string }>(`/admin/buyers/${buyer.id}`, body) : await post<{ id: string }>('/admin/buyers', body);
      toast.success('Client saved.');
      invalidate('buyers');
      onSaved?.(saved.id);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <Modal title={buyer ? `Edit ${buyer.fullName}` : 'Add a client'} sub="Private to the admin." size="lg" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!d.fullName.trim()} onClick={() => void save()}>Save</Button></>}>
      <div className="form-grid">
        <Field label="Full name" className="full"><Input value={d.fullName} onChange={(e) => setD({ ...d, fullName: e.target.value })} autoFocus /></Field>
        <Field label="Email"><Input type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} /></Field>
        <Field label="Phone"><Input value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} /></Field>
        <Field label="Country"><Input value={d.countryIso} maxLength={2} onChange={(e) => setD({ ...d, countryIso: e.target.value.toUpperCase() })} placeholder="RW" /></Field>
        <Field label="Stage"><Select value={d.stage} onChange={(e) => setD({ ...d, stage: e.target.value })} options={BUYER_STAGES.map((s) => ({ value: s, label: humanise(s) }))} /></Field>
        <Field label="Source"><Input value={d.source} onChange={(e) => setD({ ...d, source: e.target.value })} placeholder="Referral, website, broker…" /></Field>
        <Field label="Agent"><Select value={d.assignedToId} onChange={(e) => setD({ ...d, assignedToId: e.target.value })} placeholder="Unassigned" options={(team ?? []).map((t) => ({ value: t.id, label: t.name }))} /></Field>
        <Field label="Notes" className="full"><Textarea rows={3} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></Field>
      </div>
      {err && <Alert tone="error">{err}</Alert>}
    </Modal>
  );
}

/** §13 — clients from prospect to resident, with the pipeline counted by stage. */
export default function Buyers() {
  const { can } = useAuth();
  const toast = useToast();
  const [s, set] = useSearchState({ page: '1' });
  const [q, setQ] = useState(s.q ?? '');
  const term = useDebounced(q);
  const [adding, setAdding] = useState(s.new === '1');
  useEffect(() => {
    if ((s.q ?? '') !== term) set({ q: term, page: 1 });
  }, [term, s.q, set]);
  const query = qs({ q: s.q, stage: s.stage, archived: s.archived, page: s.page });
  const { data, error } = useQuery(`buyers:${query}`, () => get<Paged<BuyerRow> & { stages: Record<string, number> }>(`/admin/buyers${query}`));

  const setStage = async (b: BuyerRow, stage: string) => {
    try {
      await patch(`/admin/buyers/${b.id}`, { stage });
      toast.success(`${b.fullName}: ${humanise(stage)}.`);
      invalidate('buyers');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <PageHead title="Buyers & clients" sub="From first enquiry to owner and resident.">
        {can('buyer.edit') && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAdding(true)}>Add client</Button>}
      </PageHead>

      <Card pad>
        <div className="row-wrap" style={{ gap: 6 }}>
          <button type="button" className="btn sm" aria-pressed={!s.stage} onClick={() => set({ stage: '', page: 1 })} style={!s.stage ? { borderColor: 'var(--sky-400)', color: 'var(--sky-700)' } : undefined}>All</button>
          {BUYER_STAGES.map((st, i) => (
            <span key={st} className="row" style={{ gap: 6 }}>
              <button type="button" className={`btn sm`} onClick={() => set({ stage: s.stage === st ? '' : st, page: 1 })} style={s.stage === st ? { borderColor: 'var(--sky-400)', color: 'var(--sky-700)', background: 'var(--sky-50)' } : undefined}>
                {humanise(st)} <strong className="tabular">{data?.stages[st] ?? 0}</strong>
              </button>
              {i < BUYER_STAGES.length - 1 && <ChevronRight size={14} className="faint" />}
            </span>
          ))}
        </div>
      </Card>

      <Card>
        <div className="card-head">
          <Input className="sm" style={{ maxWidth: 280 }} placeholder="Name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="spacer" />
          <Button size="sm" variant={s.archived ? 'primary' : 'default'} onClick={() => set({ archived: s.archived ? '' : 'true', page: 1 })}>{s.archived ? 'Showing archive' : 'Archive'}</Button>
        </div>
        {error && <div className="card-body"><ErrorBox error={error} /></div>}
        <div className="table-wrap" style={{ padding: '0 14px 14px' }}>
          <table className="table">
            <thead><tr><th>Client</th><th>Stage</th><th>Residences</th><th>Interested in</th><th>Agent</th><th>Source</th><th className="num">Enquiries</th><th>Updated</th></tr></thead>
            <tbody>
              {!data && Array.from({ length: 5 }, (_, i) => <tr key={i}><td colSpan={8}><Skeleton h={22} /></td></tr>)}
              {(data?.data ?? []).map((b) => (
                <tr key={b.id} data-clickable="true" onClick={() => navigate(`/buyers/${b.id}`)}>
                  <td><span className="cell-strong">{b.fullName}</span><div className="muted small">{b.email ?? b.phone ?? ''}</div></td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {can('buyer.edit') ? (
                      <select className={`status-select tone-${STAGE_TONE[b.stage]}`} value={b.stage} onChange={(e) => void setStage(b, e.target.value)} aria-label={`Stage of ${b.fullName}`}>
                        {BUYER_STAGES.map((st) => <option key={st} value={st}>{humanise(st)}</option>)}
                      </select>
                    ) : (
                      <span className={`badge tone-${STAGE_TONE[b.stage]}`}>{humanise(b.stage)}</span>
                    )}
                  </td>
                  <td>{b.units.map((u) => fmtCode(u.code)).join(', ') || <span className="faint">—</span>}</td>
                  <td className="muted">{b.interests.map((u) => fmtCode(u.code)).join(', ') || '—'}</td>
                  <td>{b.assignedTo?.name ?? <span className="faint">Unassigned</span>}</td>
                  <td className="muted">{b.source ?? '—'}</td>
                  <td className="num">{b.enquiryCount || '—'}</td>
                  <td className="muted small">{ago(b.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data?.data.length === 0 && <Empty title="No clients match" icon={<Handshake size={34} />} />}
        </div>
        <div className="table-foot">{data && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(p) => set({ page: p })} />}</div>
      </Card>
      {adding && <BuyerForm onClose={() => { setAdding(false); set({ new: null }); }} onSaved={(id) => navigate(`/buyers/${id}`)} />}
    </>
  );
}
