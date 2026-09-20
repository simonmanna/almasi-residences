import { useState } from 'react';
import { ExternalLink, ImageIcon, Search } from 'lucide-react';
import {
  COPY_TOKEN_HELP,
  SCHEMA_TYPES,
  SEO_DESCRIPTION_MAX,
  SEO_ENTITY_LABELS,
  SEO_ENTITY_SCHEMA_DEFAULT,
  SEO_ENTITY_TYPES,
  SEO_TITLE_MAX,
  type SeoEntityType,
} from '@avida/types';
import { get, put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { invalidate, useQuery } from '../lib/query';
import { useSearchState } from '../lib/router';
import { SITE_URL } from '../lib/site';
import type { MediaView } from '../lib/types';
import { MediaPicker } from '../components/Media';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, CardHead, Empty, ErrorBox, Field, Input, LoadingPage, MediaImg, Modal, PageHead, Select, Tabs, Textarea, Toggle } from '../components/ui';

interface EntitySeo {
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: MediaView | null;
  robotsIndex: boolean;
  robotsFollow: boolean;
  schemaType: string | null;
  keywords: string[];
  updatedAt: string;
}

interface Record_ {
  id: string;
  label: string;
  slug: string;
  sub?: string;
  published?: boolean;
  path: string;
  seo: EntitySeo | null;
}

const Count = ({ n, max }: { n: number; max: number }) => <span className={n > max ? 'text-danger small' : 'muted small'}>{n} / {max}</span>;

/** A search result preview: what Google shows, so the manager writes for it. */
function Snippet({ path, title, description }: { path: string; title: string; description: string }) {
  return (
    <div className="serp">
      <span className="serp-url">{SITE_URL.replace(/^https?:\/\//, '')}{path === '/' ? '' : path}</span>
      <span className="serp-title">{title || 'Derived from the record'}</span>
      <span className="serp-desc">{description || 'Derived from the record — its own description, size, floor and status.'}</span>
    </div>
  );
}

function RecordForm({ type, record, onClose }: { type: SeoEntityType; record: Record_; onClose: () => void }) {
  const toast = useToast();
  const seo = record.seo;
  const [d, setD] = useState({
    title: seo?.title ?? '',
    metaDescription: seo?.metaDescription ?? '',
    canonicalUrl: seo?.canonicalUrl ?? '',
    ogTitle: seo?.ogTitle ?? '',
    ogDescription: seo?.ogDescription ?? '',
    robotsIndex: seo?.robotsIndex ?? true,
    robotsFollow: seo?.robotsFollow ?? true,
    schemaType: seo?.schemaType ?? SEO_ENTITY_SCHEMA_DEFAULT[type],
    keywords: seo?.keywords ?? [],
  });
  const [image, setImage] = useState<MediaView | null>(seo?.ogImage ?? null);
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await put(`/admin/seo/entities/${type}/${record.id}`, {
        title: d.title.trim() || null,
        metaDescription: d.metaDescription.trim() || null,
        canonicalUrl: d.canonicalUrl.trim() || null,
        ogTitle: d.ogTitle.trim() || null,
        ogDescription: d.ogDescription.trim() || null,
        ogImageId: image?.id ?? null,
        robotsIndex: d.robotsIndex,
        robotsFollow: d.robotsFollow,
        schemaType: d.schemaType,
        keywords: d.keywords,
      });
      toast.success('Search metadata saved. The page updates straight away.');
      invalidate('seo');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={record.label}
      sub={record.path}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={busy} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <Snippet path={record.path} title={d.title} description={d.metaDescription} />
      <Field label={<span className="row" style={{ justifyContent: 'space-between' }}>Title <Count n={d.title.length} max={SEO_TITLE_MAX} /></span>} hint="Empty derives one from the record itself.">
        <Input value={d.title} maxLength={SEO_TITLE_MAX} onChange={(e) => setD({ ...d, title: e.target.value })} />
      </Field>
      <Field
        label={<span className="row" style={{ justifyContent: 'space-between' }}>Description <Count n={d.metaDescription.length} max={SEO_DESCRIPTION_MAX} /></span>}
        hint={`Empty derives one from the record. ${COPY_TOKEN_HELP}`}
      >
        <Textarea rows={3} value={d.metaDescription} onChange={(e) => setD({ ...d, metaDescription: e.target.value })} />
      </Field>
      <div className="grid-2">
        <Field label="Share title" hint="Empty uses the title above.">
          <Input value={d.ogTitle} maxLength={SEO_TITLE_MAX} onChange={(e) => setD({ ...d, ogTitle: e.target.value })} />
        </Field>
        <Field label="Structured data type" hint="What this page claims to be. It must match what the page actually shows.">
          <Select value={d.schemaType} onChange={(e) => setD({ ...d, schemaType: e.target.value })} options={SCHEMA_TYPES.map((t) => ({ value: t, label: t }))} />
        </Field>
      </div>
      <Field label="Share description" hint="Empty uses the description above.">
        <Textarea rows={2} value={d.ogDescription} onChange={(e) => setD({ ...d, ogDescription: e.target.value })} />
      </Field>
      <Field label="Share image" hint="Shown when the page is sent on WhatsApp, LinkedIn or X.">
        <div className="row" style={{ gap: 10 }}>
          {image && (
            <div style={{ width: 120, height: 63, position: 'relative', borderRadius: 6, overflow: 'hidden' }}>
              <MediaImg m={image} sizes="120px" />
            </div>
          )}
          <Button size="sm" icon={<ImageIcon size={14} />} onClick={() => setPick(true)}>
            {image ? 'Change' : 'Choose'}
          </Button>
          {image && (
            <Button size="sm" variant="ghost" onClick={() => setImage(null)}>
              Remove
            </Button>
          )}
        </div>
      </Field>
      <Field label="Canonical address" hint="Only when this page is a copy of another. Empty uses its own address, which is almost always right.">
        <Input value={d.canonicalUrl} onChange={(e) => setD({ ...d, canonicalUrl: e.target.value })} placeholder={record.path} />
      </Field>
      <Field label="Keywords" hint="Separated by commas. Used for your own reference and the page's keywords tag.">
        <Input
          value={d.keywords.join(', ')}
          onChange={(e) => setD({ ...d, keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) })}
        />
      </Field>
      <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
        <Toggle checked={d.robotsIndex} onChange={(v) => setD({ ...d, robotsIndex: v })} label="Allow search engines to list this page" />
        <Toggle checked={d.robotsFollow} onChange={(v) => setD({ ...d, robotsFollow: v })} label="Follow the links on it" />
      </div>
      {pick && <MediaPicker onClose={() => setPick(false)} onPick={([m]) => m && setImage(m)} />}
    </Modal>
  );
}

/**
 * Website → Search metadata. The same editor for every kind of page the
 * database can produce: a residence, a type, a neighbourhood, an article.
 * Anything left empty is derived by the website from the record itself.
 */
export default function SeoRecords() {
  const { can } = useAuth();
  const editable = can('content.edit');
  const [params, setParams] = useSearchState({ type: 'UNIT' });
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Record_ | null>(null);
  const kind = (SEO_ENTITY_TYPES as readonly string[]).includes(params.type ?? '') ? (params.type as SeoEntityType) : 'UNIT';
  const { data, error, refetch } = useQuery(`seo:entities:${kind}`, () => get<Record_[]>(`/admin/seo/entities/${kind}`));
  if (error) return <ErrorBox error={error} onRetry={refetch} />;

  const rows = (data ?? []).filter((r) => !q.trim() || r.label.toLowerCase().includes(q.trim().toLowerCase()));
  const written = (data ?? []).filter((r) => r.seo?.title ?? r.seo?.metaDescription).length;

  return (
    <>
      <PageHead title="Search metadata" sub="Titles, descriptions and share images, record by record" crumbs={[{ label: 'Website' }, { label: 'Search metadata' }]} />
      <Card>
        <CardHead
          title={SEO_ENTITY_LABELS[kind]}
          icon={<Search size={18} />}
          sub={data ? `${written} of ${data.length} have metadata of their own; the rest are derived` : 'Loading'}
        >
          <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 220 }} />
        </CardHead>
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <Tabs
            value={kind}
            onChange={(v) => setParams({ type: v })}
            tabs={SEO_ENTITY_TYPES.map((t) => ({ value: t, label: SEO_ENTITY_LABELS[t] }))}
          />
        </div>
        {!data ? (
          <LoadingPage />
        ) : rows.length === 0 ? (
          <Empty title="Nothing here yet" icon={<Search size={32} />}>
            {q ? 'No record matches that search.' : `There are no ${SEO_ENTITY_LABELS[kind].toLowerCase()} records yet.`}
          </Empty>
        ) : (
          <div className="table-wrap" style={{ padding: '0 14px 14px' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Record</th>
                  <th>Title</th>
                  <th>Description</th>
                  <th>Search</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong style={{ color: 'var(--navy)' }}>{r.label}</strong>
                      {r.sub && <div className="muted small">{r.sub}</div>}
                    </td>
                    <td>{r.seo?.title ?? <span className="muted small">Derived</span>}</td>
                    <td className="muted small">{r.seo?.metaDescription ? `${r.seo.metaDescription.slice(0, 70)}…` : 'Derived'}</td>
                    <td>
                      <Badge tone={r.seo && !r.seo.robotsIndex ? 'amber' : 'green'} plain>
                        {r.seo && !r.seo.robotsIndex ? 'Hidden' : 'Listed'}
                      </Badge>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                        <a className="btn sm" href={`${SITE_URL}${r.path}`} target="_blank" rel="noreferrer" aria-label={`View ${r.label} on the website`}>
                          <ExternalLink size={14} />
                        </a>
                        {editable && (
                          <Button size="sm" onClick={() => setEdit(r)}>
                            Edit
                          </Button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {edit && <RecordForm type={kind} record={edit} onClose={() => setEdit(null)} />}
    </>
  );
}
