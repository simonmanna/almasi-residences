import { useState } from 'react';
import { ExternalLink, ImageIcon, Search } from 'lucide-react';
import { COPY_TOKEN_HELP, SEO_DESCRIPTION_MAX, SEO_TITLE_MAX } from '@avida/types';
import { get, put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { invalidate, useQuery } from '../lib/query';
import { SITE_URL } from '../lib/site';
import type { MediaView } from '../lib/types';
import { MediaPicker } from '../components/Media';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, CardHead, ErrorBox, Field, Input, LoadingPage, MediaImg, Modal, PageHead, Textarea, Toggle } from '../components/ui';

interface Route {
  path: string;
  label: string;
  title: string | null;
  description: string | null;
  noindex: boolean;
  ogImage: MediaView | null;
}
interface SeoData {
  site: { title: string; description: string; keywords: string[] } | null;
  routes: Route[];
}

const Count = ({ n, max }: { n: number; max: number }) => <span className={n > max ? 'text-danger small' : 'muted small'}>{n} / {max}</span>;

/** A search result preview: what Google shows, so the manager writes for it. */
function Snippet({ path, title, description }: { path: string; title: string; description: string }) {
  return (
    <div className="serp">
      <span className="serp-url">{SITE_URL.replace(/^https?:\/\//, '')}{path === '/' ? '' : path}</span>
      <span className="serp-title">{title || 'Untitled page'}</span>
      <span className="serp-desc">{description || 'No description — search engines will choose text from the page.'}</span>
    </div>
  );
}

function RouteForm({ route, site, onClose }: { route: Route; site: SeoData['site']; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState({ title: route.title ?? '', description: route.description ?? '', noindex: route.noindex });
  const [image, setImage] = useState<MediaView | null>(route.ogImage);
  const [pick, setPick] = useState(false);
  const save = async () => {
    try {
      await put('/admin/seo/pages', { path: route.path, title: d.title || null, description: d.description || null, noindex: d.noindex, ogImageId: image?.id ?? null });
      toast.success('Search metadata saved.');
      invalidate('seo');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Modal title={route.label} sub={route.path} size="lg" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => void save()}>Save</Button></>}>
      <Snippet path={route.path} title={d.title || site?.title || ''} description={d.description || site?.description || ''} />
      <Field label={<span className="row" style={{ justifyContent: 'space-between' }}>Title <Count n={d.title.length} max={SEO_TITLE_MAX} /></span>} hint="Empty uses the page name with the site title after it.">
        <Input value={d.title} maxLength={SEO_TITLE_MAX} onChange={(e) => setD({ ...d, title: e.target.value })} />
      </Field>
      <Field label={<span className="row" style={{ justifyContent: 'space-between' }}>Description <Count n={d.description.length} max={SEO_DESCRIPTION_MAX} /></span>} hint={`Empty uses the site-wide description. ${COPY_TOKEN_HELP}`}>
        <Textarea rows={3} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
      </Field>
      <Field label="Share image" hint="Shown when the page is shared on WhatsApp, LinkedIn or X.">
        <div className="row" style={{ gap: 10 }}>
          {image && <div style={{ width: 120, height: 63, position: 'relative', borderRadius: 6, overflow: 'hidden' }}><MediaImg m={image} sizes="120px" /></div>}
          <Button size="sm" icon={<ImageIcon size={14} />} onClick={() => setPick(true)}>{image ? 'Change' : 'Choose'}</Button>
          {image && <Button size="sm" variant="ghost" onClick={() => setImage(null)}>Remove</Button>}
        </div>
      </Field>
      <Toggle checked={d.noindex} onChange={(v) => setD({ ...d, noindex: v })} label="Hide this page from search engines" />
      {pick && <MediaPicker onClose={() => setPick(false)} onPick={([m]) => m && setImage(m)} />}
    </Modal>
  );
}

/** Roadmap item 24 — what search engines and link previews read, page by page. */
export default function Seo() {
  const { can } = useAuth();
  const toast = useToast();
  const editable = can('content.edit');
  const { data, error, refetch } = useQuery('seo', () => get<SeoData>('/admin/seo'));
  const [site, setSite] = useState<SeoData['site'] | null>(null);
  const [edit, setEdit] = useState<Route | null>(null);
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data) return <LoadingPage />;
  const s = site ?? data.site ?? { title: '', description: '', keywords: [] };

  const saveSite = async () => {
    try {
      await put('/admin/seo/site', { title: s.title, description: s.description, keywords: s.keywords });
      toast.success('Site-wide metadata saved.');
      setSite(null);
      invalidate('seo');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <PageHead title="SEO" sub="Titles, descriptions and share images for every page" />
      <Card pad>
        <CardHead title="Site-wide" sub="Used wherever a page has none of its own" icon={<Search size={18} />}>
          {editable && <Button variant="primary" size="sm" disabled={!site} onClick={() => void saveSite()}>Save</Button>}
        </CardHead>
        <Snippet path="/" title={s.title} description={s.description} />
        <Field label={<span className="row" style={{ justifyContent: 'space-between' }}>Site title <Count n={s.title.length} max={SEO_TITLE_MAX} /></span>}>
          <Input value={s.title} disabled={!editable} onChange={(e) => setSite({ ...s, title: e.target.value })} />
        </Field>
        <Field label="Description" hint={COPY_TOKEN_HELP}>
          <Textarea rows={3} value={s.description} disabled={!editable} onChange={(e) => setSite({ ...s, description: e.target.value })} />
        </Field>
        <Field label="Keywords" hint="Separated by commas.">
          <Input value={s.keywords.join(', ')} disabled={!editable} onChange={(e) => setSite({ ...s, keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) })} />
        </Field>
      </Card>
      <Card>
        <CardHead title="Pages" />
        {data.routes.map((r) => (
          <div key={r.path} className="row" style={{ padding: '12px 22px', borderTop: '1px solid var(--line-2)' }}>
            <div style={{ width: 200 }}>
              <strong style={{ color: 'var(--navy)' }}>{r.label}</strong>
              <div className="muted small">{r.path}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="small" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title ?? <span className="muted">Default title</span>}</div>
              <div className="muted small" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.description ?? 'Site-wide description'}</div>
            </div>
            {r.noindex && <Badge tone="amber">Hidden from search</Badge>}
            {r.ogImage && <Badge tone="sky" plain>Share image</Badge>}
            <a className="btn btn-ghost btn-sm" href={`${SITE_URL}${r.path}`} target="_blank" rel="noreferrer" aria-label={`Open ${r.label}`}><ExternalLink size={14} /></a>
            {editable && <Button size="sm" onClick={() => setEdit(r)}>Edit</Button>}
          </div>
        ))}
      </Card>
      {edit && <RouteForm route={edit} site={data.site} onClose={() => setEdit(null)} />}
    </>
  );
}
