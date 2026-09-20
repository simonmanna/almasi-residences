import { useState } from 'react';
import { ExternalLink, FileText, ImageIcon, Plus, Trash2 } from 'lucide-react';
import { POST_CATEGORIES, slugify } from '@avida/types';
import { del, get, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { SITE_URL } from '../lib/site';
import type { MediaView } from '../lib/types';
import { MediaPicker } from '../components/Media';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, CardHead, Drawer, Empty, ErrorBox, Field, Input, LoadingPage, MediaImg, NumberInput, PageHead, Select, Textarea, Toggle, useConfirm } from '../components/ui';

interface PostRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  category: string;
  tags: string[];
  authorName: string | null;
  readMinutes: number | null;
  heroImage: MediaView | null;
  published: boolean;
  publishedAt: string | null;
  updatedAt: string;
}

function PostForm({ row, onClose }: { row?: PostRow; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState({
    title: row?.title ?? '',
    slug: row?.slug ?? '',
    excerpt: row?.excerpt ?? '',
    body: row?.body ?? '',
    category: row?.category ?? 'Guides',
    tags: row?.tags ?? [],
    authorName: row?.authorName ?? '',
    readMinutes: row?.readMinutes ?? null,
    published: row?.published ?? false,
  });
  const [hero, setHero] = useState<MediaView | null>(row?.heroImage ?? null);
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const slug = d.slug.trim() || slugify(d.title);
  const valid = d.title.trim().length > 1 && d.body.trim().length > 20;

  const save = async () => {
    setBusy(true);
    const body = {
      title: d.title.trim(),
      slug,
      excerpt: d.excerpt.trim() || null,
      body: d.body,
      category: d.category,
      tags: d.tags,
      authorName: d.authorName.trim() || null,
      readMinutes: d.readMinutes,
      heroImageId: hero?.id ?? null,
      published: d.published,
    };
    try {
      if (row) await patch(`/admin/posts/${row.id}`, body);
      else await post('/admin/posts', body);
      toast.success(`${body.title} saved.${row && row.slug !== slug ? ' The old address now redirects to the new one.' : ''}`);
      invalidate('posts', 'seo');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      title={row ? `Edit ${row.title}` : 'New article'}
      sub={`/insights/${slug || '…'}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={busy} disabled={!valid} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <Field label="Title" hint="The question a reader is actually asking.">
        <Input value={d.title} autoFocus onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="Buying an apartment in Kigali: what to expect" />
      </Field>
      <div className="grid-2">
        <Field label="Address" hint="Changing it keeps the old address working.">
          <Input value={d.slug} onChange={(e) => setD({ ...d, slug: slugify(e.target.value) })} placeholder={slugify(d.title)} />
        </Field>
        <Field label="Subject">
          <Select value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })} options={POST_CATEGORIES.map((c) => ({ value: c, label: c }))} />
        </Field>
      </div>
      <Field label="Summary" hint="Two sentences. Shown on the index and used as the page's description in search results.">
        <Textarea rows={3} value={d.excerpt} onChange={(e) => setD({ ...d, excerpt: e.target.value })} />
      </Field>
      <Field label="The article" hint="Markdown: ## for a heading, - for a list, [words](/residences) to link into the site. Link to the residences and the neighbourhoods where it helps the reader.">
        <Textarea rows={20} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} />
      </Field>
      <div className="grid-3">
        <Field label="Author" hint="Empty publishes it under the company name.">
          <Input value={d.authorName} onChange={(e) => setD({ ...d, authorName: e.target.value })} />
        </Field>
        <Field label="Reading time" hint="Empty counts the words.">
          <NumberInput value={d.readMinutes} onChange={(v) => setD({ ...d, readMinutes: v })} suffix="min" step="1" min={1} />
        </Field>
        <Field label="Visible">
          <Toggle checked={d.published} onChange={(v) => setD({ ...d, published: v })} label={d.published ? 'Published' : 'Draft'} />
        </Field>
      </div>
      <Field label="Tags" hint="Separated by commas.">
        <Input value={d.tags.join(', ')} onChange={(e) => setD({ ...d, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} />
      </Field>
      <Field label="Header image">
        <div className="row" style={{ gap: 10 }}>
          {hero && (
            <div style={{ width: 120, height: 63, position: 'relative', borderRadius: 6, overflow: 'hidden' }}>
              <MediaImg m={hero} sizes="120px" />
            </div>
          )}
          <Button size="sm" icon={<ImageIcon size={14} />} onClick={() => setPick(true)}>
            {hero ? 'Change' : 'Choose'}
          </Button>
          {hero && (
            <Button size="sm" variant="ghost" onClick={() => setHero(null)}>
              Remove
            </Button>
          )}
        </div>
      </Field>
      {pick && <MediaPicker onClose={() => setPick(false)} onPick={([m]) => m && setHero(m)} />}
    </Drawer>
  );
}

/**
 * Website → Insights. The guides that answer what buyers ask before they ask
 * a salesperson — and the pages that bring them here in the first place.
 */
export default function Insights() {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const editable = can('content.edit');
  const { data, error, refetch } = useQuery('posts', () => get<PostRow[]>('/admin/posts'));
  const [edit, setEdit] = useState<PostRow | 'new' | null>(null);
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data) return <LoadingPage />;

  const remove = async (row: PostRow) => {
    if (!(await confirm({ title: `Delete ${row.title}?`, body: 'The article and its search metadata go with it.', confirm: 'Delete', danger: true }))) return;
    try {
      await del(`/admin/posts/${row.id}`);
      toast.success('Article deleted.');
      invalidate('posts', 'seo');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <PageHead title="Insights" sub="Guides and neighbourhood writing" crumbs={[{ label: 'Website' }, { label: 'Insights' }]}>
        <a className="btn" href={`${SITE_URL}/insights`} target="_blank" rel="noreferrer">
          <ExternalLink size={15} /> View on the website
        </a>
        {editable && (
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEdit('new')}>
            New article
          </Button>
        )}
      </PageHead>
      <Card>
        <CardHead title="Articles" icon={<FileText size={18} />} sub={`${data.filter((r) => r.published).length} published of ${data.length}`} />
        {data.length === 0 ? (
          <Empty title="Nothing written yet" icon={<FileText size={32} />}>
            Start with the questions buyers ask most: what buying here involves, and what the neighbourhood is like.
          </Empty>
        ) : (
          <div className="table-wrap" style={{ padding: '0 14px 14px' }}>
            <table className="table">
              <thead>
                <tr>
                  <th />
                  <th>Title</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.id}>
                    <td style={{ width: 56 }}>
                      <MediaImg m={row.heroImage} thumb sizes="48px" style={{ width: 48, height: 34, objectFit: 'cover', borderRadius: 4 }} />
                    </td>
                    <td>
                      <strong style={{ color: 'var(--navy)' }}>{row.title}</strong>
                      <div className="muted small">/insights/{row.slug}</div>
                    </td>
                    <td>
                      <Badge tone="sky" plain>
                        {row.category}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={row.published ? 'green' : 'amber'} plain>
                        {row.published ? 'Published' : 'Draft'}
                      </Badge>
                    </td>
                    <td className="muted small nowrap">{ago(row.updatedAt)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                        <a className="btn sm" href={`${SITE_URL}/insights/${row.slug}`} target="_blank" rel="noreferrer" aria-label={`View ${row.title}`}>
                          <ExternalLink size={14} />
                        </a>
                        {editable && (
                          <>
                            <Button size="sm" onClick={() => setEdit(row)}>
                              Edit
                            </Button>
                            <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} aria-label={`Delete ${row.title}`} onClick={() => void remove(row)} />
                          </>
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
      {edit && <PostForm row={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  );
}
