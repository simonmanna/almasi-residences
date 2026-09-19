import { useState } from 'react';
import { Archive, DoorOpen, History, LogOut, Mail, Pencil, Phone, RotateCcw } from 'lucide-react';
import { humanise } from '@avida/types';
import { get, post, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { code as fmtCode, date, dateTime, initials, STAGE_TONE } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { Link } from '../lib/router';
import type { ActivityRow, Paged } from '../lib/types';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, CardHead, ErrorBox, Field, Input, KV, LoadingPage, Modal, PageHead, Select, useConfirm } from '../components/ui';
import { OCCUPANCY_TONE, ResidentForm, type ResidentRow } from './Residents';

interface ResidentDetail extends ResidentRow {
  unit: { id: string; code: string; status: string; floor: { label: string }; typology: { name: string } } | null;
  residencies: { id: string; startedAt: string; endedAt: string | null; unit: { id: string; code: string } }[];
  parkingSpaces: { id: string; code: string; level: string }[];
  buyer: { id: string; fullName: string; stage: string } | null;
  activity: ActivityRow[];
  createdAt: string;
}

function MoveModal({ r, onClose }: { r: ResidentDetail; onClose: () => void }) {
  const toast = useToast();
  const { data: units } = useQuery('residences:sold', () => get<Paged<{ id: string; code: string }>>(`/admin/residences${qs({ status: 'SOLD', pageSize: 500, sort: 'code' })}`));
  const [unitId, setUnitId] = useState('');
  const [when, setWhen] = useState(new Date().toISOString().slice(0, 10));
  const save = async () => {
    try {
      await post(`/admin/residents/${r.id}/assign`, { unitId, moveInDate: when });
      toast.success('Moved in. The residence now shows as occupied.');
      invalidate(`residents`, 'residence:', 'dashboard', 'residences', 'building');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Modal title={r.unit ? `Move ${r.fullName} to another residence` : `Move ${r.fullName} in`} sub="The current stay is closed and a new one opened, so the residence history stays complete." onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!unitId} onClick={() => void save()}>Move in</Button></>}>
      <Field label="Residence" hint="Only sold residences are listed."><Select value={unitId} onChange={(e) => setUnitId(e.target.value)} placeholder="Choose" options={(units?.data ?? []).filter((u) => u.id !== r.unit?.id).map((u) => ({ value: u.id, label: fmtCode(u.code) }))} /></Field>
      <Field label="Move-in date"><Input type="date" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
    </Modal>
  );
}

/** §12 — one resident: contact, where they live, their history. */
export default function ResidentDetailPage({ params }: { params: Record<string, string> }) {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: r, error, refetch } = useQuery(`residents:detail:${params.id}`, () => get<ResidentDetail>(`/admin/residents/${params.id}`));
  const [edit, setEdit] = useState(false);
  const [move, setMove] = useState(false);
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!r) return <LoadingPage />;
  const editable = can('resident.edit');

  const act = async (what: 'out' | 'archive' | 'restore') => {
    const text = what === 'out' ? { title: `Move ${r.fullName} out?`, body: 'Their stay is closed today. If nobody else lives there, the residence goes back to sold.' } : what === 'archive' ? { title: `Archive ${r.fullName}?`, body: 'They are moved out and hidden from the list. Their history is kept.' } : null;
    if (text && !(await confirm({ ...text, confirm: what === 'out' ? 'Move out' : 'Archive', danger: true }))) return;
    try {
      if (what === 'out') await post(`/admin/residents/${r.id}/assign`, { unitId: null });
      else await post(`/admin/residents/${r.id}/${what}`);
      toast.success('Done.');
      invalidate('residents', 'residence:', 'dashboard', 'residences', 'building');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <PageHead title={<span className="row" style={{ gap: 14 }}><span className="avatar">{initials(r.fullName)}</span>{r.fullName}</span>} crumbs={[{ label: 'Residents', to: '/residents' }, { label: r.fullName }]}>
        <Badge tone={OCCUPANCY_TONE[r.occupancyStatus]}>{humanise(r.occupancyStatus)}</Badge>
        {r.archivedAt && <Badge tone="grey">Archived</Badge>}
        {editable && !r.archivedAt && (
          <>
            <Button icon={<Pencil size={15} />} onClick={() => setEdit(true)}>Edit</Button>
            <Button icon={<DoorOpen size={15} />} onClick={() => setMove(true)}>{r.unit ? 'Change residence' : 'Move in'}</Button>
            {r.unit && <Button icon={<LogOut size={15} />} onClick={() => void act('out')}>Move out</Button>}
            <Button variant="danger" icon={<Archive size={15} />} onClick={() => void act('archive')}>Archive</Button>
          </>
        )}
        {editable && r.archivedAt && <Button icon={<RotateCcw size={15} />} onClick={() => void act('restore')}>Restore</Button>}
      </PageHead>

      <div className="grid-3" style={{ alignItems: 'start' }}>
        <Card>
          <CardHead title="Contact" />
          <div className="card-body">
            <KV items={[
              [<span className="row" style={{ gap: 6 }}><Mail size={14} /> Email</span>, r.email ? <a href={`mailto:${r.email}`}>{r.email}</a> : '—'],
              [<span className="row" style={{ gap: 6 }}><Phone size={14} /> Phone</span>, r.phone ? <a href={`tel:${r.phone}`}>{r.phone}</a> : '—'],
              ['Country', r.countryIso ?? '—'],
              ['Relationship', humanise(r.residentType)],
              ['Client record', r.buyer ? <Link to={`/buyers/${r.buyer.id}`}>{r.buyer.fullName} <Badge tone={STAGE_TONE[r.buyer.stage]} plain>{humanise(r.buyer.stage)}</Badge></Link> : '—'],
              ['On record since', date(r.createdAt)],
            ]} />
          </div>
        </Card>
        <Card>
          <CardHead title="Occupancy" />
          <div className="card-body">
            <KV items={[
              ['Residence', r.unit ? <Link to={`/residences/${r.unit.id}`}>{fmtCode(r.unit.code)} · {r.unit.floor.label}</Link> : 'Not assigned'],
              ['Type', r.unit?.typology.name ?? '—'],
              ['Moved in', date(r.moveInDate)],
              ['Moved out', date(r.moveOutDate)],
              ['Parking', r.parkingSpaces.map((p) => p.code).join(', ') || '—'],
            ]} />
            {r.notes && <p style={{ marginBottom: 0, whiteSpace: 'pre-line' }}>{r.notes}</p>}
          </div>
        </Card>
        <Card>
          <CardHead title="Residence history" icon={<History size={17} />} />
          <div className="card-body timeline">
            {r.residencies.length === 0 && <p className="muted small">No stays recorded.</p>}
            {r.residencies.map((h) => (
              <div key={h.id} className="timeline-item">
                <span className={`timeline-dot ${h.endedAt ? 'tone-grey' : 'tone-green'}`} />
                <div>
                  <Link to={`/residences/${h.unit.id}`} className="cell-strong">{fmtCode(h.unit.code)}</Link>
                  <div className="muted small">{date(h.startedAt)} — {h.endedAt ? date(h.endedAt) : 'now'}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHead title="Activity" icon={<History size={17} />} />
        <div className="card-body">
          {r.activity.length === 0 && <p className="muted small">No changes yet.</p>}
          {r.activity.map((a) => (
            <div key={a.id} className="row" style={{ padding: '8px 0', borderTop: '1px solid var(--line-2)' }}>
              <span style={{ flex: 1 }}>{a.summary}</span>
              <span className="muted small">{a.actorName} · {dateTime(a.createdAt)}</span>
            </div>
          ))}
        </div>
      </Card>

      {edit && <ResidentForm resident={r} onClose={() => { setEdit(false); refetch(); }} />}
      {move && <MoveModal r={r} onClose={() => { setMove(false); refetch(); }} />}
    </>
  );
}
