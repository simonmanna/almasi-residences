import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Check, FileText, Film, ImagePlus, Replace, Star, Trash2, UploadCloud } from 'lucide-react';
import { categoriesFor, categoryLabel, MEDIA_PROVENANCES, PROVENANCE_LABEL, PROVENANCE_NOTE, type MediaCollectionValue } from '@avida/types';
import { API_ORIGIN, csrfToken, del, get, mediaUrl, patch, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { bytes, date } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { Link, useDebounced } from '../lib/router';
import { PreviewButton } from './PreviewButton';
import type { MediaView, Paged } from '../lib/types';
import { useToast } from './Toast';
import { Alert, Badge, Button, Drawer, Empty, Field, Input, KV, MediaImg, Modal, Pagination, Select, Textarea, Toggle, useConfirm } from './ui';

export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/avif,image/gif,image/svg+xml';
export const VIDEO_ACCEPT = 'video/mp4,video/webm,video/quicktime';
export const PLAN_ACCEPT = `${IMAGE_ACCEPT},application/pdf,model/gltf-binary,.glb`;

/** Everything media-related the rest of the app may be showing. */
export const invalidateMedia = () => invalidate('assets', 'residence:', 'floor:', 'amenities', 'galleries', 'gallery:', 'dashboard', 'property');

/**
 * Multipart upload with progress. fetch() cannot report upload progress, so
 * this one request uses XMLHttpRequest; the session cookie goes with it.
 */
export function uploadFiles(files: File[], fields: Record<string, string | null | undefined>, onProgress: (pct: number) => void): Promise<MediaView[]> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) if (v) form.append(k, v);
    for (const f of files) form.append('file', f, f.name);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_ORIGIN}/api/v1/admin/assets/upload`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('x-csrf-token', csrfToken());
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error body */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as MediaView[]);
      else reject(new Error((body as { detail?: string } | null)?.detail ?? `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('The upload could not reach the server.'));
    xhr.send(form);
  });
}

export function Dropzone({ onFiles, accept, multiple = true, title, hint }: { onFiles: (files: File[]) => void; accept?: string; multiple?: boolean; title?: string; hint?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const files = [...e.dataTransfer.files];
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };
  return (
    <div
      className="dropzone"
      data-over={over}
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <UploadCloud size={30} />
      <strong>{title ?? 'Drag files here, or click to choose'}</strong>
      <span className="small muted">{hint ?? 'JPG, PNG, WebP up to 30 MB. Resized for the web automatically.'}</span>
      <input
        ref={input}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
    </div>
  );
}

/**
 * §15 — drag-and-drop, bulk upload. Files go up in groups of four so a
 * forty-photo shoot shows progress and one bad file does not sink the rest.
 */
export function MediaUploader({ fields, accept = IMAGE_ACCEPT, onDone, title, hint }: { fields: Record<string, string | null | undefined>; accept?: string; onDone?: (m: MediaView[]) => void; title?: string; hint?: string }) {
  const { can } = useAuth();
  const toast = useToast();
  const [jobs, setJobs] = useState<{ name: string; pct: number; error?: string }[]>([]);
  if (!can('media.edit')) return null;

  const start = async (files: File[]) => {
    const groups: File[][] = [];
    for (let i = 0; i < files.length; i += 4) groups.push(files.slice(i, i + 4));
    setJobs(files.map((f) => ({ name: f.name, pct: 0 })));
    const done: MediaView[] = [];
    let offset = 0;
    for (const g of groups) {
      const base = offset;
      try {
        const res = await uploadFiles(g, fields, (pct) => setJobs((js) => js.map((j, i) => (i >= base && i < base + g.length ? { ...j, pct } : j))));
        done.push(...res);
        setJobs((js) => js.map((j, i) => (i >= base && i < base + g.length ? { ...j, pct: 100 } : j)));
      } catch (e) {
        setJobs((js) => js.map((j, i) => (i >= base && i < base + g.length ? { ...j, error: (e as Error).message } : j)));
      }
      offset += g.length;
    }
    if (done.length) {
      toast.success(`Uploaded ${done.length} file${done.length === 1 ? '' : 's'}.`);
      invalidateMedia();
      onDone?.(done);
    }
    setTimeout(() => setJobs((js) => js.filter((j) => j.error)), 1500);
  };

  return (
    <div className="stack-sm">
      <Dropzone onFiles={(f) => void start(f)} accept={accept} title={title} hint={hint} />
      {jobs.length > 0 && (
        <div className="upload-list">
          {jobs.map((j, i) => (
            <div key={i} className="upload-item">
              <span style={{ width: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.name}</span>
              {j.error ? <span className="small" style={{ color: 'var(--red)' }}>{j.error}</span> : <div className="progress"><span style={{ width: `${j.pct}%` }} /></div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Tile({ m, selected, onClick, onToggle, draggable, dragging, onDragStart, onDragOver, onDrop, badge }: {
  m: MediaView;
  selected?: boolean;
  onClick?: () => void;
  onToggle?: () => void;
  draggable?: boolean;
  dragging?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: DragEvent) => void;
  onDrop?: () => void;
  badge?: ReactNode;
}) {
  return (
    <div
      className="media-tile"
      data-selected={selected}
      data-draggable={draggable}
      data-dragging={dragging}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      title={m.title ?? undefined}
    >
      {m.kind === 'IMAGE' ? (
        <MediaImg m={m} thumb sizes="200px" />
      ) : m.kind === 'VIDEO' ? (
        <div className="doc"><Film size={30} />Video</div>
      ) : (
        <div className="doc"><FileText size={30} />{m.mimeType === 'application/pdf' ? 'PDF' : '3D model'}</div>
      )}
      <div className="tile-tag">
        {m.isCover && <Badge tone="gold" plain><Star size={11} /> Cover</Badge>}
        {!m.published && <Badge tone="grey" plain>Hidden</Badge>}
        {badge}
      </div>
      {onToggle && (
        <span
          className="tile-check"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {selected && <Check size={14} color="var(--sky-600)" />}
        </span>
      )}
      <div className="tile-foot">{m.title ?? 'Untitled'}</div>
    </div>
  );
}

/** Thumbnails, selectable, and reorderable by dragging when `onReorder` is given. */
export function MediaGrid({ items, onOpen, selected, onToggle, onReorder, small, empty }: {
  items: MediaView[];
  onOpen?: (m: MediaView) => void;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  onReorder?: (ids: string[]) => void;
  small?: boolean;
  empty?: ReactNode;
}) {
  const [drag, setDrag] = useState<string | null>(null);
  const [order, setOrder] = useState<MediaView[] | null>(null);
  const list = order ?? items;
  if (!items.length) return <>{empty ?? <Empty title="Nothing here yet" icon={<ImagePlus size={32} />} />}</>;

  const move = (overId: string) => {
    if (!drag || drag === overId) return;
    const cur = [...list];
    const from = cur.findIndex((m) => m.id === drag);
    const to = cur.findIndex((m) => m.id === overId);
    cur.splice(to, 0, cur.splice(from, 1)[0]!);
    setOrder(cur);
  };

  return (
    <div className={`media-grid ${small ? 'sm' : ''}`}>
      {list.map((m) => (
        <Tile
          key={m.id}
          m={m}
          selected={selected?.has(m.id)}
          onClick={() => onOpen?.(m)}
          onToggle={onToggle ? () => onToggle(m.id) : undefined}
          draggable={Boolean(onReorder)}
          dragging={drag === m.id}
          onDragStart={() => setDrag(m.id)}
          onDragOver={(e) => {
            e.preventDefault();
            move(m.id);
          }}
          onDrop={() => {
            if (order) onReorder?.(order.map((x) => x.id));
            setDrag(null);
            setOrder(null);
          }}
        />
      ))}
    </div>
  );
}

/** §15 — captions, alt text, category, visibility, cover, replace and delete for one file. */
export function MediaEditor({ media, onClose }: { media: MediaView; onClose: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const editable = can('media.edit');
  const [draft, setDraft] = useState({
    title: media.title ?? '',
    altText: media.altText ?? '',
    caption: media.caption ?? '',
    category: media.category,
    published: media.published,
    provenance: media.provenance ?? 'PHOTOGRAPH',
    focusX: media.focusX ?? null,
    focusY: media.focusY ?? null,
  });
  const [busy, setBusy] = useState(false);
  const replaceInput = useRef<HTMLInputElement>(null);
  const cats = categoriesFor(media.collection as MediaCollectionValue);

  const save = async (extra: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      await patch(`/admin/assets/${media.id}`, { ...draft, ...extra, title: draft.title || null, altText: draft.altText || null, caption: draft.caption || null });
      toast.success('Saved.');
      invalidateMedia();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const replace = async (file: File) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file, file.name);
      const res = await fetch(`${API_ORIGIN}/api/v1/admin/assets/${media.id}/replace`, {
        method: 'POST',
        body: form,
        credentials: 'include',
        headers: { 'x-csrf-token': csrfToken() },
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { detail?: string }).detail ?? 'Replace failed');
      toast.success('File replaced. Everywhere it is used now shows the new one.');
      invalidateMedia();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: 'Delete this file?',
      body: `“${media.title ?? 'Untitled'}” will be removed from ${media.owner?.label ?? 'the library'}${media.galleryCount ? ` and ${media.galleryCount} galler${media.galleryCount === 1 ? 'y' : 'ies'}` : ''}, and from the website. This cannot be undone.`,
      confirm: 'Delete file',
      danger: true,
    });
    if (!ok) return;
    try {
      await del(`/admin/assets/${media.id}`);
      toast.success('File deleted.');
      invalidateMedia();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Drawer
      title={media.title ?? 'Untitled file'}
      sub={media.owner?.label ? `Attached to ${media.owner.label}` : undefined}
      onClose={onClose}
      footer={
        editable && (
          <>
            <Button variant="primary" busy={busy} onClick={() => void save()}>
              Save
            </Button>
            {media.kind === 'IMAGE' && media.collection === 'LIBRARY' && !media.isCover && (media.unitId || media.floorId || media.amenityId || media.typologyId) && (
              <Button icon={<Star size={15} />} onClick={() => void save({ isCover: true })}>
                Make cover
              </Button>
            )}
            <span className="spacer" />
            <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => void remove()} aria-label="Delete file" />
          </>
        )
      }
    >
      <div className="featured-photo" style={{ aspectRatio: media.width && media.height ? `${media.width} / ${media.height}` : '16 / 10', maxHeight: 340 }}>
        {media.kind === 'IMAGE' && (
          <button
            type="button"
            className="focal-picker"
            disabled={!editable}
            aria-label="Set the focal point: click the part of the image that must stay in frame"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setDraft({ ...draft, focusX: Math.round(((e.clientX - r.left) / r.width) * 100), focusY: Math.round(((e.clientY - r.top) / r.height) * 100) });
            }}
          >
            <MediaImg m={media} sizes="480px" style={{ objectFit: 'contain', background: '#0f2540' }} />
            {draft.focusX !== null && draft.focusY !== null && <span className="focal-dot" style={{ left: `${draft.focusX}%`, top: `${draft.focusY}%` }} aria-hidden="true" />}
          </button>
        )}
        {media.kind === 'VIDEO' && <video src={mediaUrl(media.url)} controls style={{ width: '100%', height: '100%' }} />}
        {media.kind !== 'IMAGE' && media.kind !== 'VIDEO' && (
          <a className="doc" href={mediaUrl(media.originalUrl)} target="_blank" rel="noreferrer" style={{ height: '100%' }}>
            <FileText size={36} /> Open file
          </a>
        )}
      </div>
      <KV
        items={[
          ['Type', `${media.kind.toLowerCase()} · ${media.mimeType}`],
          ['Size', `${bytes(media.sizeBytes)}${media.width ? ` · ${media.width}×${media.height}` : ''}`],
          ['Uploaded', date(media.createdAt)],
          ['Original', <a href={mediaUrl(media.originalUrl)} target="_blank" rel="noreferrer">Download</a>],
        ]}
      />
      <Field label="Title">
        <Input value={draft.title} disabled={!editable} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
      </Field>
      {media.kind === 'IMAGE' && (
        <Field label="Alt text" hint="What the image shows, for screen readers and search engines.">
          <Textarea rows={2} value={draft.altText} disabled={!editable} onChange={(e) => setDraft({ ...draft, altText: e.target.value })} style={{ minHeight: 64 }} />
        </Field>
      )}
      <Field label="Caption" hint="Shown beneath the image on the website, where the page has room for one.">
        <Input value={draft.caption} disabled={!editable} onChange={(e) => setDraft({ ...draft, caption: e.target.value })} />
      </Field>
      <Field label="Category">
        <Select value={draft.category} disabled={!editable} onChange={(e) => setDraft({ ...draft, category: e.target.value })} options={cats.map((c) => ({ value: c, label: categoryLabel(c) }))} />
      </Field>
      <UsageList id={media.id} />
      {(media.kind === 'IMAGE' || media.kind === 'VIDEO') && (
        <Field label="What this file is" hint="A render is never shown as if it were a photograph: the website prints the note for it beside the image.">
          <Select value={draft.provenance} disabled={!editable} onChange={(e) => setDraft({ ...draft, provenance: e.target.value })} options={MEDIA_PROVENANCES.map((v) => ({ value: v, label: `${PROVENANCE_LABEL[v]}${PROVENANCE_NOTE[v] ? ` — “${PROVENANCE_NOTE[v]}”` : ''}` }))} />
        </Field>
      )}
      {media.kind === 'IMAGE' && (
        <p className="muted small" style={{ margin: 0 }}>
          Focal point: {draft.focusX !== null ? `${draft.focusX}% across, ${draft.focusY}% down` : 'centre'}. Click the image to keep that part in frame on narrow screens.
          {draft.focusX !== null && editable && (
            <>
              {' '}
              <button type="button" className="link" onClick={() => setDraft({ ...draft, focusX: null, focusY: null })}>Reset</button>
            </>
          )}
        </p>
      )}
      {media.kind === 'IMAGE' && media.published && !draft.altText.trim() && (
        <Alert tone="warn">This image has no alt text. Visitors using a screen reader will hear nothing about it.</Alert>
      )}
      <Toggle checked={draft.published} disabled={!editable} onChange={(v) => setDraft({ ...draft, published: v })} label="Show on the website" />
      {editable && (
        <>
          <Button icon={<Replace size={15} />} onClick={() => replaceInput.current?.click()} busy={busy}>
            Replace file
          </Button>
          <input ref={replaceInput} type="file" hidden onChange={(e) => e.target.files?.[0] && void replace(e.target.files[0])} />
        </>
      )}
    </Drawer>
  );
}

/** Roadmap item 39 — where this file appears on the website, each with a preview of that page. */
function UsageList({ id }: { id: string }) {
  const { data } = useQuery(`assets:usage:${id}`, () => get<MediaView>(`/admin/assets/${id}`));
  const usage = data?.usage;
  if (!usage) return null;
  return (
    <Field label="Where it appears" hint={usage.length ? undefined : 'Not used anywhere on the website yet.'}>
      <ul className="usage-list">
        {usage.map((u, i) => (
          <li key={i}>
            <Link to={u.adminPath}>{u.label}</Link>
            <PreviewButton path={u.path} size="xs" label="Preview" variant="ghost" />
          </li>
        ))}
      </ul>
    </Field>
  );
}

/** Choose one (or several) files from the library, or upload new ones on the spot. */
export function MediaPicker({ onPick, onClose, kind = 'IMAGE', collection = 'LIBRARY', multiple, title = 'Choose from the media library' }: {
  onPick: (m: MediaView[]) => void;
  onClose: () => void;
  kind?: string;
  collection?: string;
  multiple?: boolean;
  title?: string;
}) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<Map<string, MediaView>>(new Map());
  const term = useDebounced(q);
  const key = `assets:picker:${kind}:${collection}:${term}:${page}`;
  const { data } = useQuery(key, () => get<Paged<MediaView>>(`/admin/assets${qs({ kind, collection, q: term, page, pageSize: 24 })}`));

  const toggle = (m: MediaView) => {
    const next = new Map(multiple ? picked : []);
    if (next.has(m.id)) next.delete(m.id);
    else next.set(m.id, m);
    setPicked(next);
    if (!multiple) {
      onPick([m]);
      onClose();
    }
  };

  return (
    <Modal
      title={title}
      size="xl"
      onClose={onClose}
      footer={
        multiple && (
          <>
            <span className="muted small" style={{ marginRight: 'auto' }}>{picked.size} selected</span>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!picked.size} onClick={() => { onPick([...picked.values()]); onClose(); }}>
              Add {picked.size || ''} file{picked.size === 1 ? '' : 's'}
            </Button>
          </>
        )
      }
    >
      <div className="row-wrap">
        <Input placeholder="Search by title or residence" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ maxWidth: 320 }} />
      </div>
      <MediaUploader fields={{ collection }} accept={kind === 'VIDEO' ? VIDEO_ACCEPT : IMAGE_ACCEPT} title="Upload new files" hint="They are added to the library and can be picked straight away." />
      <MediaGrid items={data?.data ?? []} selected={new Set(picked.keys())} onOpen={toggle} small empty={<Empty title="No files match" />} />
      {data && <Pagination page={page} pages={data.meta.pages} onChange={setPage} />}
    </Modal>
  );
}
