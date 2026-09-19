import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, FileText, MapPin, Plus, Save, Send, Sparkles, Trash2, X } from 'lucide-react';
import { del, get, patch, post, put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { invalidate, useQuery } from '../lib/query';
import { useSearchState } from '../lib/router';
import type { MediaView } from '../lib/types';
import { IMAGE_ACCEPT, MediaEditor, MediaGrid, MediaUploader } from '../components/Media';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, CardHead, Drawer, Empty, ErrorBox, Field, Input, LoadingPage, MediaImg, PageHead, Textarea, Toggle, useConfirm } from '../components/ui';

interface Amenity {
  id: string;
  name: string;
  slug: string | null;
  shortDescription: string | null;
  descriptionMd: string | null;
  iconKey: string | null;
  location: string | null;
  specifications: { label: string; value: string }[] | null;
  published: boolean;
  sortOrder: number;
  mediaCount: number;
  cover: MediaView | null;
  media: MediaView[];
}

interface AmenitiesPageData {
  content: Record<string, unknown>;
  hasDraft: boolean;
}

function PageIntroductionEditor() {
  const { can } = useAuth();
  const toast = useToast();
  const { data, error, refetch } = useQuery('pages:amenities', () => get<AmenitiesPageData>('/admin/pages/amenities'));
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setValue((data.content.heroLede as string) ?? '');
  }, [data]);
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data) return null;
  const editable = can('content.edit');
  const canPublish = can('content.publish');
  const dirty = value !== ((data.content.heroLede as string) ?? '');

  const save = async (publish: boolean) => {
    setBusy(true);
    try {
      if (dirty) await put('/admin/pages/amenities', { content: { ...data.content, heroLede: value } });
      if (publish) await post('/admin/pages/amenities/publish');
      toast.success(publish ? 'Amenities page introduction published.' : 'Introduction saved as a draft.');
      invalidate('pages:amenities', 'pages', 'publishing');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHead title="Page introduction" icon={<FileText size={18} />} sub="The paragraph beneath the main heading on the public amenities page." />
      <fieldset disabled={!editable} className="card-body stack" style={{ border: 0, margin: 0 }}>
        <Field label="Introduction">
          <Textarea rows={4} value={value} onChange={(event) => setValue(event.target.value)} />
        </Field>
        {(editable || canPublish) && (
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            {editable && <Button icon={<Save size={15} />} busy={busy} disabled={!dirty} onClick={() => void save(false)}>Save draft</Button>}
            {canPublish && <Button variant="primary" icon={<Send size={15} />} busy={busy} disabled={!dirty && !data.hasDraft} onClick={() => void save(true)}>Publish</Button>}
          </div>
        )}
      </fieldset>
    </Card>
  );
}

function AmenityDrawer({ a, onClose }: { a: Amenity | 'new'; onClose: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const editable = can('amenity.edit');
  const src = a === 'new' ? null : a;
  const [d, setD] = useState({
    name: src?.name ?? '',
    slug: src?.slug ?? '',
    shortDescription: src?.shortDescription ?? '',
    descriptionMd: src?.descriptionMd ?? '',
    location: src?.location ?? '',
    specifications: src?.specifications ?? [],
    published: src?.published ?? true,
  });
  const [open, setOpen] = useState<MediaView | null>(null);
  const { data: list } = useQuery('amenities', () => get<Amenity[]>('/admin/amenities'));
  const live = src ? list?.find((x) => x.id === src.id) : null;

  const save = async () => {
    try {
      const body = { ...d, slug: d.slug.trim() || null, shortDescription: d.shortDescription || null, descriptionMd: d.descriptionMd || null, location: d.location || null, specifications: d.specifications.filter((s) => s.label.trim() && s.value.trim()) };
      if (src) await patch(`/admin/amenities/${src.id}`, body);
      else await post('/admin/amenities', body);
      toast.success('Amenity saved.');
      invalidate('amenities', 'dashboard');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Drawer
      title={src ? src.name : 'New amenity'}
      onClose={onClose}
      footer={editable && (
        <>
          <Button variant="primary" disabled={!d.name.trim()} onClick={() => void save()}>Save</Button>
          <span className="spacer" />
          {src && <Button variant="danger" icon={<Trash2 size={15} />} onClick={async () => {
            if (!(await confirm({ title: `Delete ${src.name}?`, body: 'It disappears from the website. Its images stay in the media library.', confirm: 'Delete amenity', danger: true }))) return;
            await del(`/admin/amenities/${src.id}`);
            invalidate('amenities', 'dashboard');
            onClose();
          }}>Delete</Button>}
        </>
      )}
    >
      <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0 }} className="stack">
        <Field label="Name"><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
        <Field label="Short description" hint="One line for cards."><Input value={d.shortDescription} onChange={(e) => setD({ ...d, shortDescription: e.target.value })} /></Field>
        <Field label="Description"><Textarea rows={4} value={d.descriptionMd} onChange={(e) => setD({ ...d, descriptionMd: e.target.value })} /></Field>
        <Field label="Where"><Input value={d.location} onChange={(e) => setD({ ...d, location: e.target.value })} placeholder="Amenity deck, level 1" /></Field>
        <Field label="Handle" hint="Pairs the amenity with its artwork on the website. Lowercase, dashes."><Input value={d.slug} onChange={(e) => setD({ ...d, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} /></Field>
        <div className="field">
          <span>Specifications</span>
          {d.specifications.map((s, i) => (
            <div key={i} className="row">
              <Input className="sm" placeholder="Length" value={s.label} onChange={(e) => setD({ ...d, specifications: d.specifications.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} />
              <Input className="sm" placeholder="15 m" value={s.value} onChange={(e) => setD({ ...d, specifications: d.specifications.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)) })} />
              <Button size="sm" variant="ghost" icon={<X size={14} />} aria-label="Remove" onClick={() => setD({ ...d, specifications: d.specifications.filter((_, k) => k !== i) })} />
            </div>
          ))}
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setD({ ...d, specifications: [...d.specifications, { label: '', value: '' }] })} style={{ justifySelf: 'start' }}>Add specification</Button>
        </div>
        <Toggle checked={d.published} onChange={(v) => setD({ ...d, published: v })} label="Show on the website" />
      </fieldset>
      {src && (
        <div className="stack-sm">
          <div className="label">Images and videos</div>
          <MediaUploader fields={{ amenityId: src.id, collection: 'LIBRARY', category: 'OTHER' }} accept={`${IMAGE_ACCEPT},video/mp4,video/webm`} title="Add images or video" hint="The first image is the cover." />
          <MediaGrid items={live?.media ?? src.media} onOpen={setOpen} small empty={<Empty title="No images yet" />} />
        </div>
      )}
      {!src && <p className="muted small">Save the amenity first, then add its images.</p>}
      {open && <MediaEditor media={open} onClose={() => setOpen(null)} />}
    </Drawer>
  );
}

/** §19 — the amenities, from the database, in the order the website shows them. */
export default function Amenities() {
  const { can } = useAuth();
  const toast = useToast();
  const [s, set] = useSearchState();
  const { data, error } = useQuery('amenities', () => get<Amenity[]>('/admin/amenities'));
  const [edit, setEdit] = useState<Amenity | 'new' | null>(null);
  useEffect(() => {
    if (s.open && data) {
      const a = data.find((x) => x.id === s.open);
      if (a) setEdit(a);
      set({ open: null });
    }
  }, [s.open, data, set]);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <LoadingPage />;
  const editable = can('amenity.edit');

  const move = async (i: number, dir: -1 | 1) => {
    const ids = data.map((a) => a.id);
    const j = i + dir;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    try {
      await post('/admin/amenities/reorder', { ids });
      invalidate('amenities');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <PageHead title="Amenities" sub={`${data.filter((a) => a.published).length} of ${data.length} shown on the website`}>
        {editable && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEdit('new')}>Add amenity</Button>}
      </PageHead>
      <PageIntroductionEditor />
      <div className="grid-3">
        {data.map((a, i) => (
          <Card key={a.id}>
            <div className="media-tile" style={{ aspectRatio: '16 / 9', borderRadius: '14px 14px 0 0', border: 0 }} onClick={() => setEdit(a)}>
              {a.cover ? <MediaImg m={a.cover} sizes="400px" /> : <div className="doc"><Sparkles size={28} />No image yet</div>}
              <div className="tile-tag">{!a.published && <Badge tone="grey" plain>Hidden</Badge>}</div>
            </div>
            <div className="card-body" style={{ paddingTop: 14 }}>
              <div className="row">
                <h3 style={{ flex: 1 }}>{a.name}</h3>
                {editable && (
                  <>
                    <Button size="xs" variant="ghost" icon={<ArrowUp size={13} />} aria-label="Earlier" disabled={i === 0} onClick={() => void move(i, -1)} />
                    <Button size="xs" variant="ghost" icon={<ArrowDown size={13} />} aria-label="Later" disabled={i === data.length - 1} onClick={() => void move(i, 1)} />
                    <Button size="xs" variant="ghost" icon={a.published ? <Eye size={13} /> : <EyeOff size={13} />} aria-label={a.published ? 'Hide' : 'Show'} onClick={async () => { await patch(`/admin/amenities/${a.id}`, { published: !a.published }); invalidate('amenities'); }} />
                  </>
                )}
              </div>
              <p className="muted small" style={{ margin: '4px 0 8px' }}>{a.shortDescription ?? a.descriptionMd}</p>
              <div className="row small muted" style={{ gap: 12 }}>
                {a.location && <span className="row" style={{ gap: 4 }}><MapPin size={13} /> {a.location}</span>}
                <span>{a.mediaCount} files</span>
                <button type="button" className="btn xs" style={{ marginLeft: 'auto' }} onClick={() => setEdit(a)}>Edit</button>
              </div>
            </div>
          </Card>
        ))}
      </div>
      {edit && <AmenityDrawer a={edit} onClose={() => setEdit(null)} />}
    </>
  );
}
