import { useState } from 'react';
import { ArrowDown, ArrowUp, ClipboardList, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { del, get, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { invalidate, useQuery } from '../lib/query';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, CardHead, Empty, ErrorBox, Field, Input, LoadingPage, Modal, PageHead, Select, Textarea, Toggle, useConfirm } from '../components/ui';

interface Spec {
  id: string;
  typologyId: string | null;
  category: string;
  label: string;
  value: string;
  published: boolean;
  sortOrder: number;
}
interface Data {
  data: Spec[];
  types: { id: string; name: string }[];
}

function SpecForm({ spec, types, typologyId, onClose }: { spec?: Spec; types: Data['types']; typologyId: string | null; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState({ label: spec?.label ?? '', value: spec?.value ?? '', category: spec?.category ?? 'General', typologyId: spec?.typologyId ?? typologyId, published: spec?.published ?? true });
  const save = async () => {
    try {
      if (spec) await patch(`/admin/specifications/${spec.id}`, d);
      else await post('/admin/specifications', d);
      toast.success('Specification saved. Every residence page that shows it is updated.');
      invalidate('specifications');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Modal
      title={spec ? 'Edit specification' : 'New specification'}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!d.label.trim() || !d.value.trim()} onClick={() => void save()}>Save</Button></>}
    >
      <Field label="Label" hint="“Floors”, “Kitchen”, “Windows”."><Input value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} autoFocus maxLength={80} /></Field>
      <Field label="What buyers read" hint="Only what the developer’s own materials state. The sale contract is the authority."><Textarea rows={3} value={d.value} onChange={(e) => setD({ ...d, value: e.target.value })} maxLength={2000} /></Field>
      <Field label="Group"><Input value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })} placeholder="Finishes, Building, Services…" /></Field>
      <Field label="Applies to" hint="A row for one type replaces a development-wide row with the same label on that type’s residences.">
        <Select value={d.typologyId ?? ''} onChange={(e) => setD({ ...d, typologyId: e.target.value || null })} options={[{ value: '', label: 'Every residence' }, ...types.map((t) => ({ value: t.id, label: `${t.name} only` }))]} />
      </Field>
      <Toggle checked={d.published} onChange={(v) => setD({ ...d, published: v })} label="Show on the website" />
    </Modal>
  );
}

/** Roadmap item 19 — the specification table on every residence page, as data. */
export default function Specifications() {
  const { can } = useAuth();
  const confirm = useConfirm();
  const { data, error, refetch } = useQuery('specifications', () => get<Data>('/admin/specifications'));
  const [edit, setEdit] = useState<{ spec?: Spec; typologyId: string | null } | null>(null);
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data) return <LoadingPage />;
  const editable = can('typology.edit');
  const scopes = [{ id: null as string | null, name: 'Every residence' }, ...data.types.map((t) => ({ id: t.id as string | null, name: t.name }))];

  const move = async (rows: Spec[], i: number, dir: -1 | 1) => {
    const ids = rows.map((r) => r.id);
    const j = i + dir;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    await post('/admin/specifications/reorder', { ids });
    invalidate('specifications');
  };

  return (
    <>
      <PageHead title="Specification" sub="How the residences are built and finished, as every residence page shows it">
        {editable && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEdit({ typologyId: null })}>New row</Button>}
      </PageHead>
      {scopes.map((scope) => {
        const rows = data.data.filter((r) => r.typologyId === scope.id);
        if (scope.id && rows.length === 0 && !editable) return null;
        return (
          <Card key={scope.id ?? 'all'}>
            <CardHead title={scope.name} sub={scope.id ? 'Replaces a development-wide row with the same label' : 'Shown on every residence page'}>
              {editable && scope.id && <Button size="sm" icon={<Plus size={14} />} onClick={() => setEdit({ typologyId: scope.id })}>Add for this type</Button>}
            </CardHead>
            {rows.length === 0 && (scope.id ? <p className="muted small" style={{ padding: '0 22px 18px' }}>No rows of its own — it shows the development-wide specification.</p> : <Empty title="No specification yet" icon={<ClipboardList size={32} />}>The residence pages show no specification section until there is a row.</Empty>)}
            {rows.map((r, i) => (
              <div key={r.id} className="row" style={{ padding: '14px 22px', borderTop: '1px solid var(--line-2)', alignItems: 'flex-start' }}>
                {editable && (
                  <span className="row" style={{ gap: 2 }}>
                    <Button size="xs" variant="ghost" icon={<ArrowUp size={13} />} aria-label={`Move ${r.label} up`} disabled={i === 0} onClick={() => void move(rows, i, -1)} />
                    <Button size="xs" variant="ghost" icon={<ArrowDown size={13} />} aria-label={`Move ${r.label} down`} disabled={i === rows.length - 1} onClick={() => void move(rows, i, 1)} />
                  </span>
                )}
                <div style={{ width: 160 }}><strong style={{ color: 'var(--navy)' }}>{r.label}</strong><div><Badge tone="sky" plain>{r.category}</Badge></div></div>
                <p style={{ flex: 1, margin: 0 }}>{r.value}</p>
                {!r.published && <Badge tone="grey" plain>Hidden</Badge>}
                {editable && (
                  <span className="row" style={{ gap: 4 }}>
                    <Button size="sm" variant="ghost" icon={r.published ? <Eye size={15} /> : <EyeOff size={15} />} aria-label={r.published ? 'Hide' : 'Show'} onClick={async () => { await patch(`/admin/specifications/${r.id}`, { published: !r.published }); invalidate('specifications'); }} />
                    <Button size="sm" icon={<Pencil size={14} />} onClick={() => setEdit({ spec: r, typologyId: r.typologyId })}>Edit</Button>
                    <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} aria-label={`Delete ${r.label}`} onClick={async () => { if (await confirm({ title: `Delete “${r.label}”?`, body: r.value, confirm: 'Delete', danger: true })) { await del(`/admin/specifications/${r.id}`); invalidate('specifications'); } }} />
                  </span>
                )}
              </div>
            ))}
          </Card>
        );
      })}
      {edit && <SpecForm spec={edit.spec} typologyId={edit.typologyId} types={data.types} onClose={() => setEdit(null)} />}
    </>
  );
}
