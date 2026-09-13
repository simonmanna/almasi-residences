import { useState } from 'react';
import { ArrowDown, ArrowUp, Crown, Pencil, Plus, Shapes, Trash2 } from 'lucide-react';
import { del, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { area } from '../lib/format';
import { invalidate } from '../lib/query';
import { useFeatures, useTypes } from '../lib/ref';
import { useSearchState } from '../lib/router';
import type { Feature, Typology } from '../lib/types';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, LoadingPage, Modal, NumberInput, PageHead, Tabs, Textarea, Toggle, useConfirm } from '../components/ui';

function TypeForm({ t, onClose }: { t?: Typology; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState({
    name: t?.name ?? '',
    bedrooms: t?.bedrooms ?? (null as number | null),
    bathrooms: t?.bathrooms ?? (null as number | null),
    areaSqmMin: t?.areaSqmMin ?? (null as number | null),
    areaSqmMax: t?.areaSqmMax ?? (null as number | null),
    descriptionMd: t?.descriptionMd ?? '',
    summary: t?.summary ?? '',
    isPenthouse: t?.isPenthouse ?? false,
    published: t?.published ?? true,
  });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...d, descriptionMd: d.descriptionMd.trim() || null, summary: d.summary.trim() || null, areaSqmMin: d.areaSqmMin ?? undefined, areaSqmMax: d.areaSqmMax ?? undefined };
      if (t) await patch(`/admin/types/${t.id}`, body);
      else await post('/admin/types', body);
      toast.success('Residence type saved.');
      invalidate('types', 'residences', 'dashboard');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={t ? `Edit ${t.name}` : 'New residence type'} sub="The website groups residences by bedrooms, with penthouses on their own." onClose={onClose} size="lg" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} disabled={!d.name.trim() || d.bedrooms === null || d.bathrooms === null} onClick={() => void save()}>Save</Button></>}>
      <div className="form-grid">
        <Field label="Name" className="full"><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Three bedroom duplex" autoFocus /></Field>
        <Field label="Bedrooms"><NumberInput value={d.bedrooms} step="1" min={0} onChange={(v) => setD({ ...d, bedrooms: v })} /></Field>
        <Field label="Bathrooms"><NumberInput value={d.bathrooms} step="0.5" min={0} onChange={(v) => setD({ ...d, bathrooms: v })} /></Field>
        <Field label="Smallest size" hint="Shown as a range until residences of this type exist."><NumberInput value={d.areaSqmMin} suffix="m²" onChange={(v) => setD({ ...d, areaSqmMin: v })} /></Field>
        <Field label="Largest size"><NumberInput value={d.areaSqmMax} suffix="m²" onChange={(v) => setD({ ...d, areaSqmMax: v })} /></Field>
        <Field label="Homepage line" className="full" hint="One sentence on the homepage card for this kind of residence."><Input value={d.summary} maxLength={300} onChange={(e) => setD({ ...d, summary: e.target.value })} /></Field>
        <Field label="Description" className="full"><Textarea rows={5} value={d.descriptionMd} onChange={(e) => setD({ ...d, descriptionMd: e.target.value })} /></Field>
        <Toggle checked={d.isPenthouse} onChange={(v) => setD({ ...d, isPenthouse: v })} label="Penthouse — listed apart from the bedroom groups" />
        <Toggle checked={d.published} onChange={(v) => setD({ ...d, published: v })} label="Show on the website" />
      </div>
    </Modal>
  );
}

function FeatureForm({ f, onClose }: { f?: Feature; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState({ name: f?.name ?? '', category: f?.category ?? 'General', iconKey: f?.iconKey ?? '' });
  const save = async () => {
    try {
      const body = { ...d, iconKey: d.iconKey || null };
      if (f) await patch(`/admin/features/${f.id}`, body);
      else await post('/admin/features', body);
      toast.success('Feature saved.');
      invalidate('features', 'residence:');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Modal title={f ? `Edit ${f.name}` : 'New feature'} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!d.name.trim()} onClick={() => void save()}>Save</Button></>}>
      <Field label="Name"><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Walk-in wardrobe" autoFocus /></Field>
      <Field label="Group"><Input value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })} placeholder="Bedrooms" /></Field>
    </Modal>
  );
}

/** §8 — residence types and the feature catalogue: data, never a list in code. */
export default function Types() {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [s, set] = useSearchState({ tab: 'types' });
  const { data: types, error } = useTypes();
  const { data: features } = useFeatures();
  const [editType, setEditType] = useState<Typology | 'new' | null>(null);
  const [editFeature, setEditFeature] = useState<Feature | 'new' | null>(null);
  const editable = can('typology.edit');
  if (error) return <ErrorBox error={error} />;
  if (!types) return <LoadingPage />;

  const moveType = async (i: number, dir: -1 | 1) => {
    const ids = types.map((t) => t.id);
    const j = i + dir;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    await post('/admin/types/reorder', { ids });
    invalidate('types');
  };

  const groups = new Map<string, Feature[]>();
  for (const f of features ?? []) groups.set(f.category, [...(groups.get(f.category) ?? []), f]);

  return (
    <>
      <PageHead title="Residence types & features">
        {editable && s.tab === 'types' && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditType('new')}>New type</Button>}
        {editable && s.tab === 'features' && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditFeature('new')}>New feature</Button>}
      </PageHead>
      <Tabs value={s.tab as 'types' | 'features'} onChange={(tab) => set({ tab })} tabs={[{ value: 'types', label: 'Residence types', count: types.length }, { value: 'features', label: 'Features', count: features?.length }]} />

      {s.tab === 'types' && (
        <Card>
          <div className="table-wrap" style={{ padding: 14 }}>
            <table className="table">
              <thead><tr><th style={{ width: 70 }} /><th>Type</th><th className="num">Beds</th><th className="num">Baths</th><th>Sizes</th><th className="num">Residences</th><th className="num">Available</th><th>Website</th><th className="actions" /></tr></thead>
              <tbody>
                {types.map((t, i) => (
                  <tr key={t.id}>
                    <td>{editable && <span className="row" style={{ gap: 2 }}><Button size="xs" variant="ghost" icon={<ArrowUp size={13} />} aria-label="Move up" disabled={i === 0} onClick={() => void moveType(i, -1)} /><Button size="xs" variant="ghost" icon={<ArrowDown size={13} />} aria-label="Move down" disabled={i === types.length - 1} onClick={() => void moveType(i, 1)} /></span>}</td>
                    <td><span className="cell-strong">{t.name}</span> {t.isPenthouse && <Badge tone="gold" plain><Crown size={11} /> Penthouse</Badge>}<div className="muted small">{t.slug}</div></td>
                    <td className="num">{t.bedrooms}</td>
                    <td className="num">{t.bathrooms}</td>
                    <td className="muted">{t.stats.areaMin !== null ? `${area(t.stats.areaMin)} – ${area(t.stats.areaMax)}` : `${area(t.areaSqmMin)} – ${area(t.areaSqmMax)}`}</td>
                    <td className="num">{t.stats.total}</td>
                    <td className="num">{t.stats.available}</td>
                    <td>{t.published ? <Badge tone="green" plain>Shown</Badge> : <Badge tone="grey" plain>Hidden</Badge>}</td>
                    <td className="actions">
                      {editable && (
                        <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                          <Button size="sm" icon={<Pencil size={14} />} onClick={() => setEditType(t)}>Edit</Button>
                          <Button size="sm" variant="danger" icon={<Trash2 size={14} />} aria-label={`Delete ${t.name}`} onClick={async () => {
                            if (!(await confirm({ title: `Delete “${t.name}”?`, body: t.stats.total ? `${t.stats.total} residences use it — change their type first.` : 'No residence uses it.', confirm: 'Delete type', danger: true }))) return;
                            try { await del(`/admin/types/${t.id}`); invalidate('types'); toast.success('Deleted.'); } catch (e) { toast.error((e as Error).message); }
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
      )}

      {s.tab === 'features' && (
        <div className="grid-3" style={{ alignItems: 'start' }}>
          {[...groups.entries()].map(([cat, list]) => (
            <Card key={cat}>
              <div className="card-head"><h3><Shapes size={16} /> {cat}</h3></div>
              <div className="card-body stack-sm">
                {list.map((f) => (
                  <div key={f.id} className="row" style={{ padding: '6px 0', borderTop: '1px solid var(--line-2)' }}>
                    <span style={{ flex: 1 }}>{f.name}</span>
                    <span className="muted small">{f.residences} residences</span>
                    {editable && (
                      <>
                        <Button size="xs" variant="ghost" icon={<Pencil size={13} />} aria-label={`Edit ${f.name}`} onClick={() => setEditFeature(f)} />
                        <Button size="xs" variant="ghost" icon={<Trash2 size={13} />} aria-label={`Delete ${f.name}`} onClick={async () => {
                          if (!(await confirm({ title: `Delete “${f.name}”?`, body: `It is removed from ${f.residences} residence${f.residences === 1 ? '' : 's'}.`, confirm: 'Delete', danger: true }))) return;
                          await del(`/admin/features/${f.id}`);
                          invalidate('features', 'residence:');
                        }} />
                      </>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}
          {groups.size === 0 && <Card><Empty title="No features yet" /></Card>}
        </div>
      )}

      {editType && <TypeForm t={editType === 'new' ? undefined : editType} onClose={() => setEditType(null)} />}
      {editFeature && <FeatureForm f={editFeature === 'new' ? undefined : editFeature} onClose={() => setEditFeature(null)} />}
    </>
  );
}
