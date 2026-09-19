import { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { del, get, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { invalidate, useQuery } from '../lib/query';
import { floorName } from '../lib/ref';
import { Link, navigate } from '../lib/router';
import type { FloorRow } from '../lib/types';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, LoadingPage, MediaImg, Modal, NumberInput, PageHead, Select, Textarea, Toggle } from '../components/ui';

const refresh = () => invalidate('floors', 'floor:', 'building', 'dashboard', 'residences', 'residence:', 'reservations', 'search:', 'sales:');

export function FloorForm({ floor, onClose }: { floor?: FloorRow; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState({
    level: floor?.level ?? null as number | null,
    label: floor?.label ?? '',
    displayName: floor?.displayName ?? '',
    description: floor?.description ?? '',
    published: floor?.published ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    if (d.level === null || !d.label.trim()) return setErr('A floor needs a level and a name.');
    setBusy(true);
    setErr(null);
    try {
      const body = { level: d.level, label: d.label.trim(), displayName: d.displayName.trim() || null, description: d.description.trim() || null, published: d.published };
      if (floor) await patch(`/admin/floors/${floor.id}`, body);
      else await post('/admin/floors', body);
      toast.success(floor ? 'Floor saved.' : 'Floor created.');
      refresh();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={floor ? `Edit ${floorName(floor)}` : 'Add a floor'} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} onClick={() => void save()}>{floor ? 'Save' : 'Create floor'}</Button></>}>
      <div className="form-grid">
        <Field label="Name" hint="As staff say it: Floor 3, Penthouse." error={err && !d.label.trim() ? err : undefined}>
          <Input value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} />
        </Field>
        <Field label="Floor Level" hint="0 is the ground floor, −1 the basement." error={err && d.level === null ? err : undefined}>
          <NumberInput value={d.level} step="1" onChange={(v) => setD({ ...d, level: v })} />
        </Field>
        <Field label="Display name" hint="What visitors read, if different." className="full">
          <Input value={d.displayName} onChange={(e) => setD({ ...d, displayName: e.target.value })} placeholder="Penthouse level" />
        </Field>
        <Field label="Description" className="full">
          <Textarea rows={3} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
        </Field>
        <Toggle checked={d.published} onChange={(v) => setD({ ...d, published: v })} label="Show on the website" />
      </div>
      {err && d.level !== null && d.label.trim() && <div className="alert error">{err}</div>}
    </Modal>
  );
}

function DeleteFloor({ floor, floors, onClose }: { floor: FloorRow; floors: FloorRow[]; onClose: () => void }) {
  const toast = useToast();
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const has = floor.stats.total > 0;
  const remove = async () => {
    setBusy(true);
    try {
      await del(`/admin/floors/${floor.id}${to ? `?reassignTo=${to}` : ''}`);
      toast.success(`${floorName(floor)} deleted${has ? ` — ${floor.stats.total} residences moved` : ''}.`);
      refresh();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={`Delete ${floorName(floor)}?`}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger" className="solid" busy={busy} disabled={has && !to} onClick={() => void remove()}>{has ? 'Move residences and delete' : 'Delete floor'}</Button></>}
    >
      {has ? (
        <>
          <div className="alert warn">This floor has {floor.stats.total} residence{floor.stats.total === 1 ? '' : 's'}. A residence cannot be left without a floor, so choose where they go.</div>
          <Field label="Move the residences to">
            <Select value={to} onChange={(e) => setTo(e.target.value)} placeholder="Choose a floor" options={floors.filter((f) => f.id !== floor.id).map((f) => ({ value: f.id, label: floorName(f) }))} />
          </Field>
        </>
      ) : (
        <p style={{ margin: 0 }}>The floor has no residences. Its images stay in the media library.</p>
      )}
    </Modal>
  );
}

/** §5 — every floor, top first. Counts come from the residences on it. */
export default function Floors() {
  const { can } = useAuth();
  const toast = useToast();
  const { data: floors, error, refetch } = useQuery('floors', () => get<FloorRow[]>('/admin/floors'));
  const [editing, setEditing] = useState<FloorRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<FloorRow | null>(null);
  const editable = can('floor.edit');
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!floors) return <LoadingPage />;

  const move = async (i: number, dir: -1 | 1) => {
    const ids = floors.map((f) => f.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    try {
      await post('/admin/floors/reorder', { ids });
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <PageHead title="Floors" sub={`${floors.length} floors · ${floors.reduce((a, f) => a + f.stats.total, 0)} residences`}>
        {editable && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing('new')}>Add floor</Button>}
      </PageHead>
      <div className="stack">
        {floors.map((f, i) => (
          <Card key={f.id}>
            <div className="row" style={{ padding: 16, gap: 18, alignItems: 'center', flexWrap: 'wrap', cursor: 'pointer' }} onClick={() => navigate(`/floors/${f.id}`)}>
              <div style={{ width: 120, height: 76, borderRadius: 10, overflow: 'hidden', flex: 'none', background: 'var(--sky-50)', display: 'grid', placeItems: 'center' }}>
                {f.cover ? <MediaImg m={f.cover} thumb sizes="140px" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Layers size={26} color="var(--sky-300)" />}
              </div>
              <div style={{ minWidth: 200, flex: 1 }}>
                <div className="row" style={{ gap: 8 }}>
                  <h3>{floorName(f)}</h3>
                  <Badge tone="grey" plain>Level {f.level}</Badge>
                  {f.displayName && <span className="muted small">Website: {f.displayName}</span>}
                  {!f.published && <Badge tone="grey" plain><EyeOff size={11} /> Hidden</Badge>}
                </div>
                <p className="muted small" style={{ margin: '4px 0 0', maxWidth: 560 }}>{f.description ?? (f.stats.total ? '' : 'No residences on this floor.')}</p>
              </div>
              <div className="row-wrap" style={{ gap: 18 }}>
                {[
                  ['Residences', f.stats.total, 'var(--navy)'],
                  ['Available', f.stats.AVAILABLE, 'var(--green)'],
                  ['Reserved', f.stats.RESERVED + f.stats.BOOKED, 'var(--blue)'],
                  ['Sold', f.stats.SOLD, 'var(--red)'],
                ].map(([l, n, c]) => (
                  <div key={l as string} style={{ textAlign: 'center', minWidth: 64 }}>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 700, color: c as string }} className="tabular">{n}</div>
                    <div className="muted small">{l}</div>
                  </div>
                ))}
              </div>
              {editable && (
                <div className="row" style={{ gap: 4 }} onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="ghost" icon={<ArrowUp size={15} />} aria-label="Move up" disabled={i === 0} onClick={() => void move(i, -1)} />
                  <Button size="sm" variant="ghost" icon={<ArrowDown size={15} />} aria-label="Move down" disabled={i === floors.length - 1} onClick={() => void move(i, 1)} />
                  <Button size="sm" variant="ghost" icon={f.published ? <Eye size={15} /> : <EyeOff size={15} />} aria-label={f.published ? 'Hide from website' : 'Show on website'} onClick={async () => { await patch(`/admin/floors/${f.id}`, { published: !f.published }); refresh(); }} />
                  <Button size="sm" icon={<Pencil size={14} />} onClick={() => setEditing(f)}>Edit</Button>
                  <Button size="sm" variant="danger" icon={<Trash2 size={14} />} aria-label="Delete floor" onClick={() => setDeleting(f)} />
                </div>
              )}
              <Link to={`/floors/${f.id}`} className="btn sm" onClick={(e) => e.stopPropagation()}>View</Link>
            </div>
          </Card>
        ))}
        {floors.length === 0 && <Card><Empty title="No floors yet" /></Card>}
      </div>
      {editing && <FloorForm floor={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteFloor floor={deleting} floors={floors} onClose={() => setDeleting(null)} />}
    </>
  );
}
