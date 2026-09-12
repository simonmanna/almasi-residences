import { useState } from 'react';
import { Sofa } from 'lucide-react';
import { humanise, ROOM_TYPES } from '@avida/types';
import { get, qs } from '../lib/api';
import { area, code as fmtCode } from '../lib/format';
import { useQuery } from '../lib/query';
import { navigate, useDebounced } from '../lib/router';
import { Card, Empty, ErrorBox, Input, PageHead, Select, Skeleton } from '../components/ui';

interface RoomRow {
  id: string;
  name: string;
  type: string;
  areaSqm: number | null;
  description: string | null;
  mediaCount: number;
  unit: { id: string; code: string; floor: { label: string } };
}

/** §47 — every room and space in the building. Each is edited on its residence's Rooms tab. */
export default function Rooms() {
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const term = useDebounced(q);
  const { data, error } = useQuery(`rooms:${type}:${term}`, () => get<RoomRow[]>(`/admin/rooms${qs({ type, q: term })}`));
  const total = (data ?? []).reduce((a, r) => a + (r.areaSqm ?? 0), 0);
  return (
    <>
      <PageHead title="Rooms & spaces" sub={data ? `${data.length} rooms · ${area(Math.round(total))} in total` : ' '} />
      <Card>
        <div className="card-head">
          <Input className="sm" style={{ maxWidth: 280 }} placeholder="Search by room or unit code" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select className="sm" style={{ width: 'auto' }} value={type} onChange={(e) => setType(e.target.value)} placeholder="All room types" options={ROOM_TYPES.map((t) => ({ value: t, label: humanise(t) }))} />
        </div>
        {error && <div className="card-body"><ErrorBox error={error} /></div>}
        <div className="table-wrap" style={{ padding: '0 14px 14px' }}>
          <table className="table">
            <thead><tr><th>Residence</th><th>Floor</th><th>Room</th><th>Type</th><th className="num">Area</th><th className="num">Photos</th></tr></thead>
            <tbody>
              {!data && Array.from({ length: 8 }, (_, i) => <tr key={i}><td colSpan={6}><Skeleton h={20} /></td></tr>)}
              {(data ?? []).map((r) => (
                <tr key={r.id} data-clickable="true" onClick={() => navigate(`/residences/${r.unit.id}?tab=rooms`)}>
                  <td className="cell-strong">{fmtCode(r.unit.code)}</td>
                  <td className="muted">{r.unit.floor.label}</td>
                  <td>{r.name}</td>
                  <td>{humanise(r.type)}</td>
                  <td className="num">{area(r.areaSqm)}</td>
                  <td className="num muted">{r.mediaCount || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data?.length === 0 && <Empty title="No rooms match" icon={<Sofa size={32} />} />}
        </div>
      </Card>
    </>
  );
}
