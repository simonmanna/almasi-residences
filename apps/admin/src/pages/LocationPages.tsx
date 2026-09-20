import { useState } from 'react';
import { ExternalLink, ImageIcon, MapPin, Plus, Trash2 } from 'lucide-react';
import { slugify } from '@avida/types';
import { del, get, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { SITE_URL } from '../lib/site';
import type { MediaView } from '../lib/types';
import { MediaPicker } from '../components/Media';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, CardHead, Drawer, Empty, ErrorBox, Field, Input, LoadingPage, MediaImg, NumberInput, PageHead, Textarea, Toggle, useConfirm } from '../components/ui';

const CATEGORIES = ['BUSINESS', 'EMBASSY', 'SHOPPING', 'LEISURE', 'SCHOOL', 'HOSPITAL', 'AIRPORT'] as const;
const CATEGORY_LABEL: Record<string, string> = {
  BUSINESS: 'Business',
  EMBASSY: 'Embassies',
  SHOPPING: 'Shopping',
  LEISURE: 'Leisure',
  SCHOOL: 'Schools',
  HOSPITAL: 'Health',
  AIRPORT: 'Airport',
};

interface LocationPageRow {
  id: string;
  slug: string;
  name: string;
  kicker: string | null;
  title: string | null;
  lede: string | null;
  body: string | null;
  locality: string | null;
  region: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  categories: string[];
  heroImage: MediaView | null;
  published: boolean;
  sortOrder: number;
  updatedAt: string;
}

function PageForm({ row, onClose }: { row?: LocationPageRow; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState({
    name: row?.name ?? '',
    slug: row?.slug ?? '',
    kicker: row?.kicker ?? '',
    title: row?.title ?? '',
    lede: row?.lede ?? '',
    body: row?.body ?? '',
    locality: row?.locality ?? '',
    region: row?.region ?? '',
    country: row?.country ?? 'RW',
    latitude: row?.latitude ?? null,
    longitude: row?.longitude ?? null,
    categories: row?.categories ?? [],
    published: row?.published ?? false,
    sortOrder: row?.sortOrder ?? 0,
  });
  const [hero, setHero] = useState<MediaView | null>(row?.heroImage ?? null);
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const slug = d.slug.trim() || slugify(d.name);
  const valid = d.name.trim().length > 1 && slug.length > 1;

  const save = async () => {
    setBusy(true);
    const body = {
      name: d.name.trim(),
      slug,
      kicker: d.kicker.trim() || null,
      title: d.title.trim() || null,
      lede: d.lede.trim() || null,
      body: d.body || null,
      locality: d.locality.trim() || null,
      region: d.region.trim() || null,
      country: d.country.trim().toUpperCase(),
      latitude: d.latitude,
      longitude: d.longitude,
      categories: d.categories,
      heroImageId: hero?.id ?? null,
      published: d.published,
      sortOrder: d.sortOrder,
    };
    try {
      if (row) await patch(`/admin/locations/${row.id}`, body);
      else await post('/admin/locations', body);
      toast.success(`${body.name} saved.${row && row.slug !== slug ? ' The old address now redirects to the new one.' : ''}`);
      invalidate('location-pages', 'seo');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      title={row ? `Edit ${row.name}` : 'New location page'}
      sub={`/locations/${slug || '…'}`}
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
      <div className="grid-2">
        <Field label="Name" hint="The neighbourhood or city, as people call it.">
          <Input value={d.name} autoFocus onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Kimihurura" />
        </Field>
        <Field label="Address" hint="Lower-case letters, numbers and hyphens. Changing it keeps the old address working.">
          <Input value={d.slug} onChange={(e) => setD({ ...d, slug: slugify(e.target.value) })} placeholder={slugify(d.name)} />
        </Field>
      </div>
      <Field label="Kicker" hint="The small line above the title.">
        <Input value={d.kicker} onChange={(e) => setD({ ...d, kicker: e.target.value })} placeholder="The neighbourhood" />
      </Field>
      <Field label="Title" hint="Empty uses the name.">
        <Input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="Living in Kimihurura" />
      </Field>
      <Field label="Introduction" hint="One paragraph. Also the page's description in search results when nothing else is written.">
        <Textarea rows={3} value={d.lede} onChange={(e) => setD({ ...d, lede: e.target.value })} />
      </Field>
      <Field
        label="The page itself"
        hint="Markdown: ## for a heading, - for a list, [words](/link) for a link. Write what a buyer moving here actually needs to know."
      >
        <Textarea rows={14} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} />
      </Field>
      <div className="grid-3">
        <Field label="Locality">
          <Input value={d.locality} onChange={(e) => setD({ ...d, locality: e.target.value })} placeholder="Kigali" />
        </Field>
        <Field label="Region">
          <Input value={d.region} onChange={(e) => setD({ ...d, region: e.target.value })} placeholder="Kigali City" />
        </Field>
        <Field label="Country" hint="Two letters.">
          <Input value={d.country} maxLength={2} onChange={(e) => setD({ ...d, country: e.target.value.toUpperCase() })} />
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Latitude" hint="Empty uses the property's own position.">
          <NumberInput value={d.latitude} onChange={(v) => setD({ ...d, latitude: v })} />
        </Field>
        <Field label="Longitude">
          <NumberInput value={d.longitude} onChange={(v) => setD({ ...d, longitude: v })} />
        </Field>
      </div>
      <Field label="Places to list" hint="Which kinds of nearby place this page shows. None selected lists every visible one.">
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {CATEGORIES.map((c) => {
            const on = d.categories.includes(c);
            return (
              <Button
                key={c}
                size="sm"
                variant={on ? 'primary' : 'default'}
                onClick={() => setD({ ...d, categories: on ? d.categories.filter((x) => x !== c) : [...d.categories, c] })}
              >
                {CATEGORY_LABEL[c]}
              </Button>
            );
          })}
        </div>
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
      <div className="grid-2">
        <Field label="Order" hint="Lower numbers come first.">
          <NumberInput value={d.sortOrder} onChange={(v) => setD({ ...d, sortOrder: v ?? 0 })} step="1" min={0} />
        </Field>
        <Field label="Visible">
          <Toggle checked={d.published} onChange={(v) => setD({ ...d, published: v })} label={d.published ? 'Published' : 'Draft'} />
        </Field>
      </div>
      {pick && <MediaPicker onClose={() => setPick(false)} onPick={([m]) => m && setHero(m)} />}
    </Drawer>
  );
}

/**
 * Website → Neighbourhoods. A page per area, because "apartments in
 * Kimihurura" is how buyers search and because someone moving to the city
 * needs the neighbourhood before they need the floor plan.
 */
export default function LocationPages() {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const editable = can('content.edit');
  const { data, error, refetch } = useQuery('location-pages', () => get<LocationPageRow[]>('/admin/locations'));
  const [edit, setEdit] = useState<LocationPageRow | 'new' | null>(null);
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data) return <LoadingPage />;

  const remove = async (row: LocationPageRow) => {
    if (!(await confirm({ title: `Delete ${row.name}?`, body: 'The page and its search metadata go with it. Add a redirect if the address was shared.', confirm: 'Delete', danger: true }))) return;
    try {
      await del(`/admin/locations/${row.id}`);
      toast.success(`${row.name} deleted.`);
      invalidate('location-pages', 'seo');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <PageHead title="Neighbourhoods" sub="A page for each area, with the places around it" crumbs={[{ label: 'Website' }, { label: 'Neighbourhoods' }]}>
        <a className="btn" href={`${SITE_URL}/locations`} target="_blank" rel="noreferrer">
          <ExternalLink size={15} /> View on the website
        </a>
        {editable && (
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEdit('new')}>
            New page
          </Button>
        )}
      </PageHead>
      <Card>
        <CardHead title="Location pages" icon={<MapPin size={18} />} sub={`${data.filter((r) => r.published).length} published of ${data.length}`} />
        {data.length === 0 ? (
          <Empty title="No location pages yet" icon={<MapPin size={32} />}>
            Write one for each neighbourhood buyers ask about.
          </Empty>
        ) : (
          <div className="table-wrap" style={{ padding: '0 14px 14px' }}>
            <table className="table">
              <thead>
                <tr>
                  <th />
                  <th>Name</th>
                  <th>Address</th>
                  <th>Places</th>
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
                      <strong style={{ color: 'var(--navy)' }}>{row.name}</strong>
                      {row.lede && <div className="muted small">{row.lede.slice(0, 80)}…</div>}
                    </td>
                    <td className="muted small">/locations/{row.slug}</td>
                    <td className="muted small">{row.categories.length ? row.categories.map((c) => CATEGORY_LABEL[c] ?? c).join(', ') : 'All'}</td>
                    <td>
                      <Badge tone={row.published ? 'green' : 'amber'} plain>
                        {row.published ? 'Published' : 'Draft'}
                      </Badge>
                    </td>
                    <td className="muted small nowrap">{ago(row.updatedAt)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                        <a className="btn sm" href={`${SITE_URL}/locations/${row.slug}`} target="_blank" rel="noreferrer" aria-label={`View ${row.name}`}>
                          <ExternalLink size={14} />
                        </a>
                        {editable && (
                          <>
                            <Button size="sm" onClick={() => setEdit(row)}>
                              Edit
                            </Button>
                            <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} aria-label={`Delete ${row.name}`} onClick={() => void remove(row)} />
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
      {edit && <PageForm row={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  );
}
