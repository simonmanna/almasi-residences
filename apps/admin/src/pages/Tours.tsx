import { useState } from 'react';
import { ArrowDown, ArrowUp, Clapperboard, ExternalLink, ImageIcon, Map, Pencil, Plus, Trash2 } from 'lucide-react';
import { COPY_TOKEN_HELP, TOUR_LEVELS } from '@avida/types';
import { del, get, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { invalidate, useQuery } from '../lib/query';
import { Link } from '../lib/router';
import { SITE_URL } from '../lib/site';
import type { MediaView } from '../lib/types';
import { MediaPicker } from '../components/Media';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, CardHead, Empty, ErrorBox, Field, Input, LoadingPage, MediaImg, Modal, PageHead, Select, Textarea, Toggle, useConfirm } from '../components/ui';

interface TourRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  published: boolean;
  where: string | null;
  stations: number;
  missingImages: number;
  cover: MediaView | null;
}

interface Scene {
  id: string;
  key: string;
  label: string;
  place: string | null;
  body: string | null;
  level: string | null;
  published: boolean;
  image: MediaView | null;
  video: MediaView | null;
}

/** Roadmap item 22 — the website's walkthroughs, station by station. */
export function ToursList() {
  const { data, error, refetch } = useQuery('tours', () => get<TourRow[]>('/admin/tours'));
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data) return <LoadingPage />;
  return (
    <>
      <PageHead title="Tours" sub="The walkthroughs on the website, and the story on the homepage" />
      {data.length === 0 && <Card><Empty title="No tours" icon={<Map size={32} />} /></Card>}
      <div className="placement-grid">
        {data.map((t) => (
          <Link key={t.id} to={`/tours/${t.id}`} className="placement placement--link">
            <div className="placement-media">{t.cover ? <MediaImg m={t.cover} sizes="360px" /> : <div className="placement-empty"><ImageIcon size={26} /></div>}</div>
            <div className="placement-body">
              <strong>{t.name}</strong>
              <p className="muted small">{t.where ?? t.slug}</p>
              <div className="row-wrap" style={{ gap: 6 }}>
                <Badge tone="sky" plain>{t.stations} stations</Badge>
                {!t.published && <Badge tone="grey">Hidden</Badge>}
                {t.missingImages > 0 && <Badge tone="amber">{t.missingImages} without an image</Badge>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

function SceneForm({ tourId, scene, isStory, onClose }: { tourId: string; scene?: Scene; isStory: boolean; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState({ label: scene?.label ?? '', place: scene?.place ?? '', body: scene?.body ?? '', level: scene?.level ?? null, published: scene?.published ?? true });
  const [image, setImage] = useState<MediaView | null>(scene?.image ?? null);
  const [video, setVideo] = useState<MediaView | null>(scene?.video ?? null);
  const [pick, setPick] = useState<'IMAGE' | 'VIDEO' | null>(null);
  const save = async () => {
    const body = { ...d, place: d.place || null, body: d.body || null, imageId: image?.id ?? null, videoId: video?.id ?? null, ...(isStory ? {} : { level: undefined }) };
    try {
      if (scene) await patch(`/admin/tours/${tourId}/scenes/${scene.id}`, body);
      else await post(`/admin/tours/${tourId}/scenes`, body);
      toast.success('Station saved.');
      invalidate('tour:', 'tours');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Modal title={scene ? `Edit “${scene.label}”` : 'New station'} size="lg" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!d.label.trim()} onClick={() => void save()}>Save</Button></>}>
      <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
        <div style={{ width: 220 }}>
          <div className="placement-media" style={{ aspectRatio: '16 / 10' }}>{image ? <MediaImg m={image} sizes="240px" /> : <div className="placement-empty"><ImageIcon size={22} /> No image</div>}</div>
          <div className="row-wrap" style={{ gap: 6, marginTop: 8 }}>
            <Button size="sm" icon={<ImageIcon size={14} />} onClick={() => setPick('IMAGE')}>{image ? 'Change' : 'Choose'} image</Button>
            <Button size="sm" icon={<Clapperboard size={14} />} onClick={() => setPick('VIDEO')}>{video ? 'Change' : 'Add'} film</Button>
            {video && <Button size="sm" variant="ghost" onClick={() => setVideo(null)}>Remove film</Button>}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Title"><Input value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} autoFocus maxLength={120} /></Field>
          <Field label="Where it is" hint="“Ground floor”, “The roof”."><Input value={d.place} onChange={(e) => setD({ ...d, place: e.target.value })} maxLength={120} /></Field>
          <Field label="What to notice" hint={COPY_TOKEN_HELP}><Textarea rows={3} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} maxLength={1000} /></Field>
          {isStory && (
            <Field label="Building gauge" hint="Which level lights on the homepage story’s gauge.">
              <Select value={d.level ?? ''} onChange={(e) => setD({ ...d, level: e.target.value || null })} options={[{ value: '', label: 'None' }, ...TOUR_LEVELS.map((l) => ({ value: l.key, label: l.label }))]} />
            </Field>
          )}
          <Toggle checked={d.published} onChange={(v) => setD({ ...d, published: v })} label="Show on the website" />
        </div>
      </div>
      {pick && <MediaPicker kind={pick} onClose={() => setPick(null)} onPick={([m]) => m && (pick === 'IMAGE' ? setImage(m) : setVideo(m))} />}
    </Modal>
  );
}

export default function TourDetail({ params }: { params: Record<string, string> }) {
  const { can } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const id = params.id!;
  const { data, error, refetch } = useQuery(`tour:${id}`, () => get<TourRow & { scenes: Scene[] }>(`/admin/tours/${id}`));
  const [edit, setEdit] = useState<Scene | 'new' | null>(null);
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data) return <LoadingPage />;
  const editable = can('content.edit');
  const isStory = data.slug === 'experience';
  const href = data.slug === 'building' ? '/tour' : data.slug === 'penthouse' ? '/tour/penthouse' : '/';

  const move = async (i: number, dir: -1 | 1) => {
    const ids = data.scenes.map((s) => s.id);
    const j = i + dir;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    await post(`/admin/tours/${id}/scenes/reorder`, { ids });
    invalidate(`tour:${id}`);
  };

  return (
    <>
      <PageHead title={data.name} sub={data.where ?? undefined} crumbs={[{ label: 'Tours', to: '/tours' }, { label: data.name }]}>
        <a className="btn" href={`${SITE_URL}${href}`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> View on the website</a>
        {editable && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEdit('new')}>New station</Button>}
      </PageHead>
      <Card pad>
        <div className="row-wrap" style={{ gap: 16, alignItems: 'flex-end' }}>
          <Field label="Name" className="grow"><Input defaultValue={data.name} disabled={!editable} onBlur={async (e) => { if (e.target.value.trim() && e.target.value !== data.name) { await patch(`/admin/tours/${id}`, { name: e.target.value.trim() }); toast.success('Saved.'); invalidate(`tour:${id}`, 'tours'); } }} /></Field>
          <Toggle checked={data.published} disabled={!editable} onChange={async (v) => { await patch(`/admin/tours/${id}`, { published: v }); invalidate(`tour:${id}`, 'tours'); }} label="Published" />
        </div>
      </Card>
      <Card>
        <CardHead title={`${data.scenes.length} stations`} sub="In the order visitors walk them" />
        {data.scenes.length === 0 && <Empty title="No stations yet" />}
        {data.scenes.map((s, i) => (
          <div key={s.id} className="row" style={{ padding: '12px 22px', borderTop: '1px solid var(--line-2)' }}>
            {editable && (
              <span className="row" style={{ gap: 2 }}>
                <Button size="xs" variant="ghost" icon={<ArrowUp size={13} />} aria-label={`Move ${s.label} earlier`} disabled={i === 0} onClick={() => void move(i, -1)} />
                <Button size="xs" variant="ghost" icon={<ArrowDown size={13} />} aria-label={`Move ${s.label} later`} disabled={i === data.scenes.length - 1} onClick={() => void move(i, 1)} />
              </span>
            )}
            <span className="muted tabular" style={{ width: 24 }}>{String(i + 1).padStart(2, '0')}</span>
            <div className="thumb" style={{ width: 96, height: 60, borderRadius: 8, overflow: 'hidden', position: 'relative', background: 'var(--line-2)' }}>{s.image ? <MediaImg m={s.image} sizes="120px" /> : null}</div>
            <div style={{ flex: 1 }}>
              <strong style={{ color: 'var(--navy)' }}>{s.label}</strong> {s.place && <span className="muted small">· {s.place}</span>}
              {s.body && <p className="muted small" style={{ margin: '4px 0 0' }}>{s.body}</p>}
            </div>
            {!s.image && <Badge tone="amber">No image</Badge>}
            {s.video && <Badge tone="sky" plain>Film</Badge>}
            {!s.published && <Badge tone="grey" plain>Hidden</Badge>}
            {editable && (
              <span className="row" style={{ gap: 4 }}>
                <Button size="sm" icon={<Pencil size={14} />} onClick={() => setEdit(s)}>Edit</Button>
                <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} aria-label={`Remove ${s.label}`} onClick={async () => { if (await confirm({ title: `Remove “${s.label}”?`, confirm: 'Remove', danger: true })) { await del(`/admin/tours/${id}/scenes/${s.id}`); invalidate(`tour:${id}`, 'tours'); } }} />
              </span>
            )}
          </div>
        ))}
      </Card>
      {edit && <SceneForm tourId={id} scene={edit === 'new' ? undefined : edit} isStory={isStory} onClose={() => setEdit(null)} />}
    </>
  );
}
