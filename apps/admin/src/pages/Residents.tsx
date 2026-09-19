import { useEffect, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { humanise, OCCUPANCY_STATUSES, RESIDENT_TYPES } from '@avida/types';
import { get, patch, post, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { code as fmtCode, date, initials } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { navigate, useDebounced, useSearchState } from '../lib/router';
import type { Paged } from '../lib/types';
import { useToast } from '../components/Toast';
import { Alert, Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHead, Pagination, Select, Skeleton, Textarea } from '../components/ui';

export interface ResidentRow {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  countryIso: string | null;
  residentType: string;
  occupancyStatus: string;
  moveInDate: string | null;
  moveOutDate: string | null;
  notes: string | null;
  archivedAt: string | null;
  unit: { id: string; code: string; floor: { label: string } } | null;
}

export const OCCUPANCY_TONE: Record<string, string> = { ACTIVE: 'green', UPCOMING: 'blue', MOVED_OUT: 'grey' };

export function ResidentForm({ resident, onClose, onSaved }: { resident?: ResidentRow; onClose: () => void; onSaved?: (id: string) => void }) {
  const toast = useToast();
  const { data: units } = useQuery('residences:sold', () => get<Paged<{ id: string; code: string; status: string }>>('/admin/residences?status=SOLD&pageSize=500&sort=code'));
  const [d, setD] = useState({
    fullName: resident?.fullName ?? '',
    email: resident?.email ?? '',
    phone: resident?.phone ?? '',
    countryIso: resident?.countryIso ?? '',
    residentType: resident?.residentType ?? 'OWNER',
    occupancyStatus: resident?.occupancyStatus ?? 'UPCOMING',
    moveInDate: resident?.moveInDate?.slice(0, 10) ?? '',
    notes: resident?.notes ?? '',
    unitId: '',
  });
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setErr(null);
    try {
      const body = {
        fullName: d.fullName.trim(),
        email: d.email.trim() || null,
        phone: d.phone.trim() || null,
        countryIso: d.countryIso.trim() || null,
        residentType: d.residentType,
        occupancyStatus: d.occupancyStatus,
        moveInDate: d.moveInDate || null,
        notes: d.notes.trim() || null,
        ...(resident ? {} : { unitId: d.unitId || null }),
      };
      const saved = resident ? await patch<{ id: string }>(`/admin/residents/${resident.id}`, body) : await post<{ id: string }>('/admin/residents', body);
      toast.success('Resident saved.');
      invalidate('residents', 'residence:', 'dashboard', 'residences');
      onSaved?.(saved.id);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <Modal title={resident ? `Edit ${resident.fullName}` : 'Add a resident'} sub="Private to the admin. Never shown on the website." size="lg" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!d.fullName.trim()} onClick={() => void save()}>Save</Button></>}>
      <div className="form-grid">
        <Field label="Full name" className="full"><Input value={d.fullName} onChange={(e) => setD({ ...d, fullName: e.target.value })} autoFocus /></Field>
        <Field label="Email"><Input type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} /></Field>
        <Field label="Phone"><Input value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} /></Field>
        <Field label="Country" hint="Two-letter code, e.g. RW."><Input value={d.countryIso} maxLength={2} onChange={(e) => setD({ ...d, countryIso: e.target.value.toUpperCase() })} /></Field>
        <Field label="Relationship"><Select value={d.residentType} onChange={(e) => setD({ ...d, residentType: e.target.value })} options={RESIDENT_TYPES.map((t) => ({ value: t, label: humanise(t) }))} /></Field>
        {!resident && (
          <Field label="Residence" hint="Only sold residences can be lived in.">
            <Select value={d.unitId} onChange={(e) => setD({ ...d, unitId: e.target.value, occupancyStatus: e.target.value ? 'ACTIVE' : d.occupancyStatus })} placeholder="Not assigned yet" options={(units?.data ?? []).map((u) => ({ value: u.id, label: fmtCode(u.code) }))} />
          </Field>
        )}
        <Field label="Occupancy"><Select value={d.occupancyStatus} onChange={(e) => setD({ ...d, occupancyStatus: e.target.value })} options={OCCUPANCY_STATUSES.map((s) => ({ value: s, label: humanise(s) }))} /></Field>
        <Field label="Move-in date"><Input type="date" value={d.moveInDate} onChange={(e) => setD({ ...d, moveInDate: e.target.value })} /></Field>
        <Field label="Notes" className="full"><Textarea rows={3} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></Field>
      </div>
      {err && <Alert tone="error">{err}</Alert>}
    </Modal>
  );
}

/** §12 — residents. Private: only roles with resident.view reach this screen. */
export default function Residents() {
  const { can } = useAuth();
  const [s, set] = useSearchState({ page: '1' });
  const [q, setQ] = useState(s.q ?? '');
  const term = useDebounced(q);
  const [adding, setAdding] = useState(s.new === '1');
  useEffect(() => {
    if ((s.q ?? '') !== term) set({ q: term, page: 1 });
  }, [term, s.q, set]);
  const query = qs({ q: s.q, occupancy: s.occupancy, archived: s.archived, page: s.page });
  const { data, error } = useQuery(`residents:${query}`, () => get<Paged<ResidentRow>>(`/admin/residents${query}`));

  return (
    <>
      <PageHead title="Residents" sub={data ? `${data.meta.total} ${s.archived ? 'archived' : 'on record'} · private to the admin` : ' '}>
        {can('resident.edit') && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAdding(true)}>Add resident</Button>}
      </PageHead>
      <Card>
        <div className="card-head">
          <Input className="sm" style={{ maxWidth: 280 }} placeholder="Name, email, phone or unit" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select className="sm" style={{ width: 'auto' }} value={s.occupancy ?? ''} onChange={(e) => set({ occupancy: e.target.value, page: 1 })} placeholder="Any occupancy" options={OCCUPANCY_STATUSES.map((o) => ({ value: o, label: humanise(o) }))} />
          <span className="spacer" />
          <Button size="sm" variant={s.archived ? 'primary' : 'default'} onClick={() => set({ archived: s.archived ? '' : 'true', page: 1 })}>{s.archived ? 'Showing archive' : 'Archive'}</Button>
        </div>
        {error && <div className="card-body"><ErrorBox error={error} /></div>}
        <div className="table-wrap" style={{ padding: '0 14px 14px' }}>
          <table className="table">
            <thead><tr><th>Resident</th><th>Residence</th><th>Relationship</th><th>Occupancy</th><th>Moved in</th><th>Contact</th></tr></thead>
            <tbody>
              {!data && Array.from({ length: 5 }, (_, i) => <tr key={i}><td colSpan={6}><Skeleton h={22} /></td></tr>)}
              {(data?.data ?? []).map((r) => (
                <tr key={r.id} data-clickable="true" onClick={() => navigate(`/residents/${r.id}`)}>
                  <td><span className="row"><span className="avatar sm">{initials(r.fullName)}</span><span className="cell-strong">{r.fullName}</span></span></td>
                  <td>{r.unit ? `${fmtCode(r.unit.code)} · ${r.unit.floor.label}` : <span className="faint">Not assigned</span>}</td>
                  <td>{humanise(r.residentType)}</td>
                  <td><Badge tone={OCCUPANCY_TONE[r.occupancyStatus]}>{humanise(r.occupancyStatus)}</Badge></td>
                  <td className="muted">{date(r.moveInDate)}</td>
                  <td className="muted small">{r.email ?? ''}{r.email && r.phone ? ' · ' : ''}{r.phone ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data?.data.length === 0 && (
            <Empty title={s.archived ? 'No archived residents' : 'No residents yet'} icon={<Users size={34} />}>
              {s.archived ? '' : 'The building is still under construction. Residents are added as sold homes are handed over.'}
            </Empty>
          )}
        </div>
        <div className="table-foot">{data && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(p) => set({ page: p })} />}</div>
      </Card>
      {adding && <ResidentForm onClose={() => { setAdding(false); set({ new: null }); }} onSaved={(id) => navigate(`/residents/${id}`)} />}
    </>
  );
}
