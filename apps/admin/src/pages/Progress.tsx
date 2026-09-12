import { useState } from 'react';
import { Eye, EyeOff, FileText, HardHat, Images, Pencil, Plus, Trash2 } from 'lucide-react';
import { del, get, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { date } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { Link } from '../lib/router';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, CardHead, Empty, ErrorBox, Field, Input, LoadingPage, Modal, NumberInput, PageHead, Textarea, Toggle, useConfirm } from '../components/ui';

interface Update {
  id: string;
  capturedOn: string;
  title: string;
  bodyMd: string | null;
  percentComplete: number | null;
  published: boolean;
}

function UpdateForm({ u, onClose }: { u?: Update; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState({ capturedOn: u?.capturedOn.slice(0, 10) ?? new Date().toISOString().slice(0, 10), title: u?.title ?? '', bodyMd: u?.bodyMd ?? '', percentComplete: u?.percentComplete ?? (null as number | null), published: u?.published ?? true });
  const save = async () => {
    try {
      const body = { ...d, capturedOn: new Date(d.capturedOn).toISOString(), bodyMd: d.bodyMd || null };
      if (u) await patch(`/admin/progress/${u.id}`, body);
      else await post('/admin/progress', body);
      toast.success('Progress update saved.');
      invalidate('progress');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Modal title={u ? 'Edit progress update' : 'New progress update'} size="lg" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!d.title.trim()} onClick={() => void save()}>Save</Button></>}>
      <div className="form-grid">
        <Field label="Date"><Input type="date" value={d.capturedOn} onChange={(e) => setD({ ...d, capturedOn: e.target.value })} /></Field>
        <Field label="Complete"><NumberInput value={d.percentComplete} suffix="%" step="1" onChange={(v) => setD({ ...d, percentComplete: v })} /></Field>
        <Field label="Title" className="full"><Input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="Roof slab poured" autoFocus /></Field>
        <Field label="What happened" className="full"><Textarea rows={5} value={d.bodyMd} onChange={(e) => setD({ ...d, bodyMd: e.target.value })} /></Field>
        <Toggle checked={d.published} onChange={(v) => setD({ ...d, published: v })} label="Show on the website" />
      </div>
      <p className="muted small">Site photographs go in the <Link to="/galleries">Construction progress gallery</Link>.</p>
    </Modal>
  );
}

/** §21 — construction progress updates, and the links to the gallery that shows the site. */
export default function Progress() {
  const { can } = useAuth();
  const confirm = useConfirm();
  const { data, error } = useQuery('progress', () => get<Update[]>('/admin/progress'));
  const [edit, setEdit] = useState<Update | 'new' | null>(null);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <LoadingPage />;
  const editable = can('content.edit');
  return (
    <>
      <PageHead title="Gallery & progress" sub="Construction updates, newest first.">
        {can('content.edit') && <Link to="/content/gallery" className="btn"><FileText size={15} /> Gallery page copy</Link>}
        <Link to="/galleries" className="btn"><Images size={15} /> Galleries</Link>
        {editable && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEdit('new')}>New update</Button>}
      </PageHead>
      <Card>
        <CardHead title="Construction timeline" icon={<HardHat size={18} />} />
        <div className="card-body timeline">
          {data.length === 0 && <Empty title="No progress updates yet">Post one when the site reaches a milestone.</Empty>}
          {data.map((u) => (
            <div key={u.id} className="timeline-item">
              <span className="timeline-dot tone-orange" />
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div className="row" style={{ gap: 8 }}><strong style={{ color: 'var(--navy)' }}>{u.title}</strong>{u.percentComplete !== null && <Badge tone="orange" plain>{u.percentComplete}%</Badge>}{!u.published && <Badge tone="grey" plain>Hidden</Badge>}</div>
                  <div className="muted small">{date(u.capturedOn)}</div>
                  {u.bodyMd && <p style={{ margin: '6px 0 0', whiteSpace: 'pre-line' }}>{u.bodyMd}</p>}
                </div>
                {editable && (
                  <span className="row" style={{ gap: 4 }}>
                    <Button size="sm" variant="ghost" icon={u.published ? <Eye size={15} /> : <EyeOff size={15} />} aria-label={u.published ? 'Hide' : 'Show'} onClick={async () => { await patch(`/admin/progress/${u.id}`, { published: !u.published }); invalidate('progress'); }} />
                    <Button size="sm" icon={<Pencil size={14} />} onClick={() => setEdit(u)}>Edit</Button>
                    <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} aria-label="Delete" onClick={async () => { if (await confirm({ title: `Delete “${u.title}”?`, confirm: 'Delete', danger: true })) { await del(`/admin/progress/${u.id}`); invalidate('progress'); } }} />
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
      {edit && <UpdateForm u={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  );
}
