import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, FolderInput, Tag, Trash2, Upload, X } from 'lucide-react';
import { categoriesFor, categoryLabel, type MediaCollectionValue } from '@avida/types';
import { get, post, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { code as fmtCode } from '../lib/format';
import { useQuery } from '../lib/query';
import { floorName, useFloors, useTypes } from '../lib/ref';
import { useDebounced, useLocation, useSearchState } from '../lib/router';
import type { MediaView, Paged } from '../lib/types';
import { IMAGE_ACCEPT, invalidateMedia, MediaEditor, MediaGrid, MediaUploader, PLAN_ACCEPT, VIDEO_ACCEPT } from '../components/Media';
import { useToast } from '../components/Toast';
import { Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHead, Pagination, Select, useConfirm } from '../components/ui';

const MODES: Record<string, { title: string; sub: string; collection: MediaCollectionValue; kind?: string; accept: string }> = {
  '/media': { title: 'Images', sub: 'Photographs and renders of the project, the residences and the amenities.', collection: 'LIBRARY', kind: 'IMAGE', accept: IMAGE_ACCEPT },
  '/videos': { title: 'Videos', sub: 'Films, walkthroughs and aerial footage.', collection: 'LIBRARY', kind: 'VIDEO', accept: VIDEO_ACCEPT },
  '/floor-plans': { title: 'Floor plans', sub: 'Residence, floor and building plans — images, PDFs and 3D plans.', collection: 'FLOOR_PLAN', accept: PLAN_ACCEPT },
  '/designs': { title: 'Designs & architectural files', sub: 'Renders, drawings, elevations, sections, site and landscape plans.', collection: 'DESIGN', accept: `${PLAN_ACCEPT},${VIDEO_ACCEPT}` },
};

type OwnerKind = '' | 'unitId' | 'floorId' | 'amenityId' | 'typologyId';

function OwnerPicker({ kind, setKind, id, setId }: { kind: OwnerKind; setKind: (k: OwnerKind) => void; id: string; setId: (v: string) => void }) {
  const { data: floors } = useFloors();
  const { data: types } = useTypes();
  const { data: units } = useQuery(kind === 'unitId' ? 'residences:picker' : null, () => get<Paged<{ id: string; code: string }>>('/admin/residences?pageSize=500&sort=code'));
  const { data: amenities } = useQuery(kind === 'amenityId' ? 'amenities' : null, () => get<{ id: string; name: string }[]>('/admin/amenities'));
  const options =
    kind === 'unitId' ? (units?.data ?? []).map((u) => ({ value: u.id, label: fmtCode(u.code) }))
    : kind === 'floorId' ? (floors ?? []).map((f) => ({ value: f.id, label: floorName(f) }))
    : kind === 'amenityId' ? (amenities ?? []).map((a) => ({ value: a.id, label: a.name }))
    : kind === 'typologyId' ? (types ?? []).map((t) => ({ value: t.id, label: t.name }))
    : [];
  return (
    <>
      <Field label="Attach to">
        <Select value={kind} onChange={(e) => { setKind(e.target.value as OwnerKind); setId(''); }} options={[{ value: '', label: 'The project (no single owner)' }, { value: 'unitId', label: 'A residence' }, { value: 'floorId', label: 'A floor' }, { value: 'amenityId', label: 'An amenity' }, { value: 'typologyId', label: 'A residence type' }]} />
      </Field>
      {kind && (
        <Field label="Which one">
          <Select value={id} onChange={(e) => setId(e.target.value)} placeholder="Choose" options={options} />
        </Field>
      )}
    </>
  );
}

/**
 * §15 / §17 / §18 — the media library. One screen serves images, videos,
 * floor plans and designs; the path decides which collection it shows.
 */
export default function MediaLibrary() {
  const { path } = useLocation();
  const mode = MODES[path] ?? MODES['/media']!;
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [s, set] = useSearchState({ page: '1' });
  const [q, setQ] = useState(s.q ?? '');
  const term = useDebounced(q);
  const [uploading, setUploading] = useState(false);
  const [upCategory, setUpCategory] = useState(categoriesFor(mode.collection)[0]!);
  const [ownerKind, setOwnerKind] = useState<OwnerKind>('');
  const [ownerId, setOwnerId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [open, setOpen] = useState<MediaView | null>(null);
  const cats = categoriesFor(mode.collection);

  useEffect(() => {
    if ((s.q ?? '') !== term) set({ q: term, page: 1 });
  }, [term, s.q, set]);

  const query = qs({ collection: mode.collection, kind: mode.kind, category: s.category, q: s.q, published: s.published, scope: s.scope, page: s.page, pageSize: 48 });
  const { data, error } = useQuery(`assets:${query}`, () => get<Paged<MediaView> & { categories: Record<string, number> }>(`/admin/assets${query}`));
  const { data: one } = useQuery(s.open ? `assets:one:${s.open}` : null, () => get<MediaView>(`/admin/assets/${s.open}`));
  useEffect(() => {
    if (one) {
      setOpen(one);
      set({ open: null });
    }
  }, [one, set]);

  const ids = [...selected];
  const bulk = async (action: string, extra: Record<string, unknown> = {}) => {
    if (action === 'delete' && !(await confirm({ title: `Delete ${ids.length} file${ids.length === 1 ? '' : 's'}?`, body: 'They are removed from every residence, gallery and page that uses them. This cannot be undone.', confirm: 'Delete files', danger: true }))) return;
    try {
      await post('/admin/assets/bulk', { ids, action, ...extra });
      toast.success('Done.');
      setSelected(new Set());
      invalidateMedia();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const total = useMemo(() => Object.values(data?.categories ?? {}).reduce((a, n) => a + n, 0), [data]);

  return (
    <>
      <PageHead title={mode.title} sub={mode.sub}>
        {can('media.edit') && <Button variant="primary" icon={<Upload size={16} />} onClick={() => setUploading((u) => !u)}>{uploading ? 'Close upload' : 'Upload'}</Button>}
      </PageHead>

      {uploading && (
        <Card pad className="stack">
          <div className="form-grid three">
            <Field label="Category"><Select value={upCategory} onChange={(e) => setUpCategory(e.target.value)} options={cats.map((c) => ({ value: c, label: categoryLabel(c) }))} /></Field>
            <OwnerPicker kind={ownerKind} setKind={setOwnerKind} id={ownerId} setId={setOwnerId} />
          </div>
          <MediaUploader
            fields={{ collection: mode.collection, category: upCategory, ...(ownerKind && ownerId ? { [ownerKind]: ownerId } : {}) }}
            accept={mode.accept}
            hint={mode.collection === 'LIBRARY' && mode.kind === 'IMAGE' ? 'Drop many at once. Each is resized to web sizes; the original is kept.' : undefined}
          />
        </Card>
      )}

      <Card>
        <div className="card-head">
          <Input className="sm" style={{ maxWidth: 260 }} placeholder="Search titles, captions, unit codes" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select className="sm" style={{ width: 'auto' }} value={s.scope ?? ''} onChange={(e) => set({ scope: e.target.value, page: 1 })} placeholder="Everything" options={[{ value: 'project', label: 'Project-level only' }]} />
          <Select className="sm" style={{ width: 'auto' }} value={s.published ?? ''} onChange={(e) => set({ published: e.target.value, page: 1 })} placeholder="Shown or hidden" options={[{ value: 'true', label: 'Shown on website' }, { value: 'false', label: 'Hidden' }]} />
          <span className="spacer" />
          <span className="muted small">{data?.meta.total ?? 0} files</span>
        </div>
        <div className="table-toolbar" style={{ gap: 6 }}>
          <button type="button" className="chip" style={!s.category ? { background: 'var(--sky-500)', color: '#fff' } : undefined} onClick={() => set({ category: '', page: 1 })}>All {total ? `(${total})` : ''}</button>
          {cats.filter((c) => data?.categories[c]).map((c) => (
            <button key={c} type="button" className="chip" style={s.category === c ? { background: 'var(--sky-500)', color: '#fff' } : undefined} onClick={() => set({ category: s.category === c ? '' : c, page: 1 })}>
              {categoryLabel(c)} ({data?.categories[c]})
            </button>
          ))}
        </div>
        <div className="card-body">
          {error && <ErrorBox error={error} />}
          <MediaGrid
            items={data?.data ?? []}
            onOpen={setOpen}
            selected={selected}
            onToggle={can('media.edit') ? (id) => setSelected((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; }) : undefined}
            empty={<Empty title={`No ${mode.title.toLowerCase()} yet`}>{can('media.edit') ? 'Use Upload to add some.' : ''}</Empty>}
          />
        </div>
        {selected.size > 0 && (
          <div className="bulk-bar">
            <strong>{selected.size} selected</strong>
            <Button size="sm" icon={<Eye size={14} />} onClick={() => void bulk('publish')}>Show</Button>
            <Button size="sm" icon={<EyeOff size={14} />} onClick={() => void bulk('unpublish')}>Hide</Button>
            <Select className="sm" style={{ width: 'auto' }} value="" onChange={(e) => e.target.value && void bulk('category', { category: e.target.value })} placeholder="Set category…" options={cats.map((c) => ({ value: c, label: categoryLabel(c) }))} />
            <Button size="sm" icon={<FolderInput size={14} />} onClick={() => setAssigning(true)}>Attach to…</Button>
            <Button size="sm" icon={<Trash2 size={14} />} onClick={() => void bulk('delete')}>Delete</Button>
            <span className="spacer" />
            <Button size="sm" variant="ghost" icon={<X size={15} />} aria-label="Clear selection" onClick={() => setSelected(new Set())} />
          </div>
        )}
        <div className="table-foot">{data && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(p) => set({ page: p })} />}</div>
      </Card>

      {assigning && (
        <Modal title={`Attach ${selected.size} files`} onClose={() => setAssigning(false)} footer={<><Button onClick={() => setAssigning(false)}>Cancel</Button><Button variant="primary" icon={<Tag size={15} />} disabled={Boolean(ownerKind) && !ownerId} onClick={() => { void bulk('assign', ownerKind ? { [ownerKind]: ownerId } : {}); setAssigning(false); }}>Attach</Button></>}>
          <OwnerPicker kind={ownerKind} setKind={setOwnerKind} id={ownerId} setId={setOwnerId} />
        </Modal>
      )}
      {open && <MediaEditor media={open} onClose={() => setOpen(null)} />}
    </>
  );
}
