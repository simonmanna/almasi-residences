import { useEffect, useState } from 'react';
import { ExternalLink, FileText, ImagePlus, Plus, Save, Send, Undo2, X } from 'lucide-react';
import { CONTENT_PAGES, COPY_TOKEN_HELP } from '@avida/types';
import type { ContentField } from '@avida/types';
import { get, post, put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { Link } from '../lib/router';
import type { MediaView } from '../lib/types';
import { MediaPicker } from '../components/Media';
import { useToast } from '../components/Toast';
import { Alert, Button, Card, CardHead, ErrorBox, Field, Input, LoadingPage, MediaImg, PageHead, Textarea, Toggle } from '../components/ui';
import { PAGE_PATH, SITE_URL } from '../lib/site';
import { PreviewButton } from '../components/PreviewButton';


interface PageData {
  key: string;
  title: string;
  description: string;
  fields: ContentField[];
  content: Record<string, unknown>;
  published: boolean;
  updatedAt: string | null;
  publishedAt: string | null;
  draftUpdatedAt: string | null;
  draftFields: string[];
  hasDraft: boolean;
  publishedContent: Record<string, unknown>;
  media: Record<string, MediaView>;
}

type ListItem = { title: string; body: string };

/** §21 — the lightweight CMS: one form per public page, fields declared in @avida/types. */
export default function ContentEditor({ params }: { params: Record<string, string> }) {
  const key = params.key!;
  const { can } = useAuth();
  const toast = useToast();
  const { data, error, refetch } = useQuery(`pages:${key}`, () => get<PageData>(`/admin/pages/${key}`));
  const { data: revisions } = useQuery(`pages:${key}:revisions`, () => get<{ id: string; createdAt: string }[]>(`/admin/pages/${key}/revisions`));
  const [content, setContent] = useState<Record<string, unknown>>({});
  const [published, setPublished] = useState(true);
  const [media, setMedia] = useState<Record<string, MediaView>>({});
  const [picker, setPicker] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) {
      setContent(data.content);
      setPublished(data.published);
      setMedia(data.media);
    }
  }, [data]);
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data) return <LoadingPage />;
  const editable = can('content.edit');
  const dirty = JSON.stringify(content) !== JSON.stringify(data.content) || published !== data.published;
  const set = (k: string, v: unknown) => setContent({ ...content, [k]: v });

  const canPublish = can('content.publish');
  const refresh = () => invalidate(`pages:${key}`, 'pages', 'publishing');

  /** §40.2 — saving keeps a draft; visitors still read the published copy. */
  const save = async (publish = false) => {
    setBusy(true);
    try {
      await put(`/admin/pages/${key}`, { content, ...(published !== data.published ? { published } : {}), ...(publish ? { publish: true } : {}) });
      toast.success(publish ? `${data.title} published. The website updates straight away.` : `Draft saved. Visitors still see the published copy — preview it, then publish.`);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const publishDraft = async () => {
    setBusy(true);
    try {
      if (dirty) await put(`/admin/pages/${key}`, { content });
      await post(`/admin/pages/${key}/publish`);
      toast.success(`${data.title} published.`);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const discard = async () => {
    await post(`/admin/pages/${key}/discard`);
    toast.success('Draft discarded. The editor shows the published copy again.');
    refresh();
  };

  const renderField = (f: ContentField) => {
    const v = content[f.key];
    if (f.type === 'textarea') return <Textarea rows={4} value={(v as string) ?? ''} onChange={(e) => set(f.key, e.target.value)} />;
    if (f.type === 'media') {
      const m = typeof v === 'string' ? media[v] : undefined;
      return (
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="media-tile" style={{ width: 220, aspectRatio: '16 / 9', cursor: editable ? 'pointer' : 'default' }} onClick={() => editable && setPicker(f.key)}>
            {m ? <MediaImg m={m} sizes="220px" /> : <div className="doc"><ImagePlus size={24} />{editable ? 'Choose' : 'None'}</div>}
          </div>
          {m && editable && <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => set(f.key, null)}>Remove</Button>}
        </div>
      );
    }
    if (f.type === 'list') {
      const items = (Array.isArray(v) ? v : []) as ListItem[];
      const update = (i: number, patchItem: Partial<ListItem>) => set(f.key, items.map((it, k) => (k === i ? { ...it, ...patchItem } : it)));
      return (
        <div className="stack-sm">
          {items.map((it, i) => (
            <div key={i} className="row" style={{ alignItems: 'flex-start' }}>
              <span className="badge tone-sky plain" style={{ marginTop: 8 }}>{String(i + 1).padStart(2, '0')}</span>
              <Input className="sm" style={{ width: 180 }} placeholder={f.itemLabel ?? 'Title'} value={it.title} onChange={(e) => update(i, { title: e.target.value })} />
              <Textarea rows={2} style={{ minHeight: 40, flex: 1 }} value={it.body} onChange={(e) => update(i, { body: e.target.value })} />
              <Button size="sm" variant="ghost" icon={<X size={14} />} aria-label="Remove" onClick={() => set(f.key, items.filter((_, k) => k !== i))} />
            </div>
          ))}
          <Button size="sm" icon={<Plus size={14} />} onClick={() => set(f.key, [...items, { title: '', body: '' }])} style={{ justifySelf: 'start' }}>Add {f.itemLabel?.toLowerCase() ?? 'item'}</Button>
        </div>
      );
    }
    if (f.type === 'boolean') {
      return <Toggle checked={v as boolean} onChange={(val) => set(f.key, val)} label="Enabled" />;
    }
    return <Input value={(v as string) ?? ''} onChange={(e) => set(f.key, e.target.value)} placeholder={f.type === 'url' ? '/residences or https://…' : undefined} />;
  };

  return (
    <>
      <PageHead title={data.title} sub={data.description} crumbs={[{ label: 'Website content' }, { label: data.title }]}>
        <a className="btn" href={`${SITE_URL}${PAGE_PATH[key] ?? '/'}`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> View page</a>
        <PreviewButton path={PAGE_PATH[key] ?? '/'} />
        {editable && <Button icon={<Save size={16} />} busy={busy} disabled={!dirty} onClick={() => void save(false)}>Save draft</Button>}
        {canPublish && <Button variant="primary" icon={<Send size={15} />} busy={busy} disabled={!dirty && !data.hasDraft} onClick={() => void publishDraft()}>Publish</Button>}
      </PageHead>
      <nav className="page-switch" aria-label="Website pages">
        {CONTENT_PAGES.map((p) => (
          <Link key={p.key} to={`/content/${p.key}`} className={p.key === key ? 'active' : undefined} aria-current={p.key === key ? 'page' : undefined}>
            {p.title}
          </Link>
        ))}
      </nav>
      {!editable && <Alert tone="info">Your role can read the website copy but not change it.</Alert>}
      {data.hasDraft && (
        <Alert tone="warn">
          <span className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <span>Unpublished draft{data.draftUpdatedAt ? ` saved ${ago(data.draftUpdatedAt)}` : ''}: {data.draftFields.length} field{data.draftFields.length === 1 ? '' : 's'} differ from the live page.{!canPublish && ' Someone who can publish must approve it.'}</span>
            {editable && <Button size="sm" variant="ghost" icon={<Undo2 size={14} />} onClick={() => void discard()}>Discard draft</Button>}
          </span>
        </Alert>
      )}
      <Card>
        <CardHead title="Page copy" icon={<FileText size={18} />} sub={data.publishedAt ? `Last published ${ago(data.publishedAt)}` : data.updatedAt ? `Last saved ${ago(data.updatedAt)}` : 'Not edited yet'}>
          <Toggle checked={published} disabled={!canPublish} onChange={setPublished} label="Use this copy on the website" />
        </CardHead>
        <fieldset disabled={!editable} style={{ border: 0, margin: 0 }} className="card-body stack">
          {data.fields.map((f) => (
            <Field key={f.key} label={<span className="row" style={{ gap: 8 }}>{f.label}{data.draftFields.includes(f.key) && <span className="badge tone-amber plain">Draft</span>}</span>} hint={f.help ?? (f.type === 'text' || f.type === 'textarea' ? `Empty shows nothing on the website. ${COPY_TOKEN_HELP}` : undefined)}>
              {renderField(f)}
            </Field>
          ))}
        </fieldset>
      </Card>
      {revisions && revisions.length > 0 && (
        <Card>
          <CardHead title="Version history" icon={<Undo2 size={18} />} sub="A rollback returns the old version as a draft for preview and approval." />
          {revisions.map((r) => <div key={r.id} className="row" style={{ padding: '12px 22px', borderTop: '1px solid var(--line-2)' }}><span style={{ flex: 1 }}>Published version from {ago(r.createdAt)}</span>{editable && <Button size="sm" icon={<Undo2 size={14} />} onClick={async () => { await post(`/admin/pages/${key}/revisions/${r.id}/restore`); toast.success('Version restored as a draft.'); refresh(); }}>Restore as draft</Button>}</div>)}
        </Card>
      )}
      {key === 'gallery' && <Alert tone="info">The galleries themselves are managed under <Link to="/galleries">Media → Galleries</Link>, and construction updates under <Link to="/progress">Gallery & progress</Link>.</Alert>}
      {key === 'contact' && <Alert tone="info">Phone, email, WhatsApp and the office address are edited on <Link to="/property">Property overview</Link>, so every page uses the same details.</Alert>}
      {key === 'amenities' && <Alert tone="info">The amenities are managed under <Link to="/amenities">Property → Amenities</Link>.</Alert>}
      {key === 'buying' && <Alert tone="info">Payment milestones come from the default <Link to="/payment-plans">payment plan</Link>, and questions from <Link to="/faqs">FAQs</Link>.</Alert>}
      {picker && (
        <MediaPicker
          onClose={() => setPicker(null)}
          onPick={([m]) => {
            if (!m) return;
            setMedia({ ...media, [m.id]: m });
            set(picker, m.id);
          }}
        />
      )}
    </>
  );
}
