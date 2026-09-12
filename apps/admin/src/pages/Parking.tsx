import { useState } from 'react';
import { Car, Pencil, Plus, Trash2 } from 'lucide-react';
import { humanise, PARKING_STATUSES, PARKING_TYPES } from '@avida/types';
import { del, get, patch, post, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { code as fmtCode, money, PARKING_TONE } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import type { Paged } from '../lib/types';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, ErrorBox, Field, Input, LoadingPage, Modal, MoneyInput, NumberInput, PageHead, Select, Stat, Textarea, useConfirm } from '../components/ui';

interface Bay {
  id: string;
  code: string;
  level: string;
  type: string;
  sizeSqm: number | null;
  status: string;
  unitId: string | null;
  residentId: string | null;
  priceMinor: number | null;
  notes: string | null;
  unit: { id: string; code: string; status: string } | null;
  resident: { id: string; fullName: string } | null;
}

function BayForm({ bay, onClose }: { bay?: Bay; onClose: () => void }) {
  const toast = useToast();
  const { data: units } = useQuery('residences:picker', () => get<Paged<{ id: string; code: string }>>('/admin/residences?pageSize=500&sort=code'));
  const [d, setD] = useState({
    code: bay?.code ?? '',
    level: bay?.level ?? 'Basement',
    type: bay?.type ?? 'STANDARD',
    sizeSqm: bay?.sizeSqm ?? (12.5 as number | null),
    status: bay?.status ?? 'AVAILABLE',
    unitId: bay?.unitId ?? '',
    priceMinor: bay?.priceMinor ?? (null as number | null),
    notes: bay?.notes ?? '',
  });
  const save = async () => {
    try {
      const body = { ...d, unitId: d.unitId || null, notes: d.notes || null };
      if (bay) await patch(`/admin/parking/${bay.id}`, body);
      else await post('/admin/parking', body);
      toast.success('Parking bay saved.');
      invalidate('parking', 'dashboard');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Modal title={bay ? `Bay ${bay.code}` : 'Add a parking bay'} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!d.code.trim()} onClick={() => void save()}>Save</Button></>}>
      <div className="form-grid">
        <Field label="Bay number"><Input value={d.code} onChange={(e) => setD({ ...d, code: e.target.value.toUpperCase() })} placeholder="P-38" /></Field>
        <Field label="Level"><Input value={d.level} onChange={(e) => setD({ ...d, level: e.target.value })} /></Field>
        <Field label="Type"><Select value={d.type} onChange={(e) => setD({ ...d, type: e.target.value })} options={PARKING_TYPES.map((t) => ({ value: t, label: t === 'EV' ? 'EV charging' : humanise(t) }))} /></Field>
        <Field label="Size"><NumberInput value={d.sizeSqm} suffix="m²" onChange={(v) => setD({ ...d, sizeSqm: v })} /></Field>
        <Field label="Status"><Select value={d.status} onChange={(e) => setD({ ...d, status: e.target.value })} options={PARKING_STATUSES.map((s) => ({ value: s, label: humanise(s) }))} /></Field>
        <Field label="Residence" hint="An assigned or sold bay belongs to a residence or resident."><Select value={d.unitId} onChange={(e) => setD({ ...d, unitId: e.target.value })} placeholder="None" options={(units?.data ?? []).map((u) => ({ value: u.id, label: fmtCode(u.code) }))} /></Field>
        <Field label="Price" hint="If bays are sold separately."><MoneyInput value={d.priceMinor} onChange={(v) => setD({ ...d, priceMinor: v })} /></Field>
        <Field label="Notes" className="full"><Textarea rows={2} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} style={{ minHeight: 60 }} /></Field>
      </div>
    </Modal>
  );
}

/** §20 — basement and visitor parking. The statistics are counted from the bays. */
export default function Parking() {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Bay | 'new' | null>(null);
  const { data, error } = useQuery(`parking:${status}:${type}:${q}`, () => get<{ data: Bay[]; stats: { total: number; byStatus: Record<string, number>; byType: Record<string, number> } }>(`/admin/parking${qs({ status, type, q })}`));
  if (error) return <ErrorBox error={error} />;
  if (!data) return <LoadingPage />;
  const editable = can('parking.edit');
  return (
    <>
      <PageHead title="Parking" sub={`${data.stats.total} bays · ${data.stats.byType.EV ?? 0} with EV charging · ${(data.stats.byType.VISITOR ?? 0) + (data.stats.byType.ACCESSIBLE ?? 0)} visitor`}>
        {editable && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEdit('new')}>Add bay</Button>}
      </PageHead>
      <div className="grid-4">
        {(['AVAILABLE', 'ASSIGNED', 'RESERVED', 'SOLD'] as const).map((s) => (
          <Stat key={s} label={humanise(s)} value={data.stats.byStatus[s] ?? 0} icon={<Car size={20} />} tone={PARKING_TONE[s]} onClick={() => setStatus(status === s ? '' : s)} />
        ))}
      </div>
      <Card>
        <div className="card-head">
          <Input className="sm" style={{ maxWidth: 240 }} placeholder="Bay or residence" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select className="sm" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All statuses" options={PARKING_STATUSES.map((s) => ({ value: s, label: humanise(s) }))} />
          <Select className="sm" style={{ width: 'auto' }} value={type} onChange={(e) => setType(e.target.value)} placeholder="All types" options={PARKING_TYPES.map((t) => ({ value: t, label: humanise(t) }))} />
        </div>
        <div className="table-wrap" style={{ padding: '0 14px 14px' }}>
          <table className="table">
            <thead><tr><th>Bay</th><th>Level</th><th>Type</th><th className="num">Size</th><th>Status</th><th>Residence</th>{can('resident.view') && <th>Resident</th>}<th className="num">Price</th><th className="actions" /></tr></thead>
            <tbody>
              {data.data.map((b) => (
                <tr key={b.id}>
                  <td className="cell-strong">{b.code}</td>
                  <td className="muted">{b.level}</td>
                  <td>{b.type === 'EV' ? 'EV charging' : humanise(b.type)}</td>
                  <td className="num">{b.sizeSqm ? `${b.sizeSqm} m²` : '—'}</td>
                  <td><Badge tone={PARKING_TONE[b.status]}>{humanise(b.status)}</Badge></td>
                  <td>{b.unit ? fmtCode(b.unit.code) : <span className="faint">—</span>}</td>
                  {can('resident.view') && <td>{b.resident?.fullName ?? <span className="faint">—</span>}</td>}
                  <td className="num">{b.priceMinor ? money(b.priceMinor) : '—'}</td>
                  <td className="actions">
                    {editable && (
                      <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        <Button size="xs" icon={<Pencil size={13} />} onClick={() => setEdit(b)}>Edit</Button>
                        <Button size="xs" variant="ghost" icon={<Trash2 size={13} />} aria-label={`Delete bay ${b.code}`} onClick={async () => {
                          if (!(await confirm({ title: `Delete bay ${b.code}?`, confirm: 'Delete', danger: true }))) return;
                          try { await del(`/admin/parking/${b.id}`); invalidate('parking', 'dashboard'); } catch (e) { toast.error((e as Error).message); }
                        }} />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {edit && <BayForm bay={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  );
}
