import { useEffect, useState } from 'react';
import { ExternalLink, FileText, ImagePlus, Plus, Save, X } from 'lucide-react';
import type { ContentField } from '@avida/types';
import { get, put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { Link } from '../lib/router';
import type { MediaView } from '../lib/types';
import { MediaPicker } from '../components/Media';
import { useToast } from '../components/Toast';
import { Alert, Button, Card, CardHead, ErrorBox, Field, Input, LoadingPage, MediaImg, PageHead, Textarea, Toggle } from '../components/ui';
import { SITE_URL } from '../lib/site';

const PAGE_PATH: Record<string, string> = { home: '/', about: '/buying', residences: '/residences', amenities: '/amenities', location: '/location', buying: '/buying', gallery: '/gallery', progress: '/progress', film: '/film', contact: '/enquire' };

interface PageData {
  key: string;
  title: string;
  description: string;
  fields: ContentField[];
  content: Record<string, unknown>;
  published: boolean;
  updatedAt: string | null;
  media: Record<string, MediaView>;
}

type ListItem = { title: string; body: string };

/** §21 — the lightweight CMS: one form per public page, fields declared in @avida/types. */
export default function ContentEditor({ params }: { params: Record<string, string> }) {
  const key = params.key!;
  const { can } = useAuth();
  const toast = useToast();
  const { data, error, refetch } = useQuery(`pages:${key}`, () => get<PageData>(`/admin/pages/${key}`));
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

  const save = async () => {
    setBusy(true);
    try {
      await put(`/admin/pages/${key}`, { content, published });
      toast.success(`${data.title} saved. The website updates straight away.`);
      invalidate(`pages:${key}`, 'pages');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
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
    return <Input value={(v as string) ?? ''} onChange={(e) => set(f.key, e.target.value)} placeholder={f.type === 'url' ? '/residences or https://…' : undefined} />;
  };

  return (
    <>
      <PageHead title={data.title} sub={data.description} crumbs={[{ label: 'Website content' }, { label: data.title }]}>
        <a className="btn" href={`${SITE_URL}${PAGE_PATH[key] ?? '/'}`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> View page</a>
        {editable && <Button variant="primary" icon={<Save size={16} />} busy={busy} disabled={!dirty} onClick={() => void save()}>Save</Button>}
      </PageHead>
      {!editable && <Alert tone="info">Your role can read the website copy but not change it.</Alert>}
      <Card>
        <CardHead title="Page copy" icon={<FileText size={18} />} sub={data.updatedAt ? `Last saved ${ago(data.updatedAt)}` : 'Not edited yet'}>
          <Toggle checked={published} disabled={!editable} onChange={setPublished} label="Use this copy on the website" />
        </CardHead>
        <fieldset disabled={!editable} style={{ border: 0, margin: 0 }} className="card-body stack">
          {data.fields.map((f) => (
            <Field key={f.key} label={f.label} hint={f.help ?? (f.type !== 'media' && f.type !== 'list' ? 'Leave empty to keep the website’s built-in text.' : undefined)}>
              {renderField(f)}
            </Field>
          ))}
        </fieldset>
      </Card>
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
