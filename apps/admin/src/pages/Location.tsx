import { useEffect, useState } from 'react';
import { ExternalLink, FileText, MapPin, Pencil, Plus, Save, Send, Trash2 } from 'lucide-react';
import { formatDistance } from '@avida/types';
import { del, get, patch, post, put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { SITE_URL } from '../lib/site';
import { useToast } from '../components/Toast';
import { Alert, Badge, Button, Card, CardHead, Empty, ErrorBox, Field, Input, LoadingPage, Modal, NumberInput, PageHead, Select, Textarea, Toggle, useConfirm } from '../components/ui';

const CATEGORIES = [
  { value: 'BUSINESS', label: 'Business' },
  { value: 'EMBASSY', label: 'Embassy' },
  { value: 'SHOPPING', label: 'Shopping' },
  { value: 'LEISURE', label: 'Leisure' },
  { value: 'SCHOOL', label: 'School' },
  { value: 'HOSPITAL', label: 'Health' },
  { value: 'AIRPORT', label: 'Airport' },
];
const categoryLabel = (c: string) => CATEGORIES.find((x) => x.value === c)?.label ?? c;

interface Landmark {
  id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  distanceM: number | null;
  driveMinutes: number | null;
  walkMinutes: number | null;
  manualDistance: boolean;
  visible: boolean;
}

interface LandmarkList {
  origin: { name: string; latitude: number; longitude: number };
  landmarks: Landmark[];
}

interface SectionPage {
  title: string;
  content: Record<string, unknown>;
  hasDraft: boolean;
  publishedAt: string | null;
  updatedAt: string | null;
}

const SECTION_FIELDS = [
  { key: 'kicker', label: 'Heading', hint: 'The large line, e.g. "Location".', type: 'text' },
  { key: 'title', label: 'Subheading', hint: 'One short line beneath the heading. Leave empty to show none.', type: 'text' },
  { key: 'lede', label: 'Description', hint: 'The paragraph above the list of places.', long: true, type: 'textarea' },
  { key: 'note', label: 'Footnote', hint: 'Small print beneath the list, e.g. how distances are measured.', type: 'text' },
  { key: 'showNearbyPlaces', label: 'Show nearby places', hint: 'Toggle to show/hide the nearby places list and map on the homepage and location page.', type: 'boolean' },
] as const;

/** "-1.9536, 30.0928" (as Google Maps copies it) → [lat, lng]. */
function parsePosition(text: string): [number, number] | null {
  const m = text.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
}

/** The words of the homepage location section — the same draft and publish flow as Page content. */
function SectionText() {
  const { can } = useAuth();
  const toast = useToast();
  const { data, error, refetch } = useQuery('pages:locationSection', () => get<SectionPage>('/admin/pages/locationSection'));
  const [content, setContent] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setContent(data.content);
  }, [data]);
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data) return <LoadingPage />;
  const editable = can('content.edit');
  const canPublish = can('content.publish');
  const dirty = JSON.stringify(content) !== JSON.stringify(data.content);
  const save = async () => {
    setBusy(true);
    try {
      await put('/admin/pages/locationSection', { content, ...(canPublish ? { publish: true } : {}) });
      toast.success(canPublish ? 'Location text published. The website updates straight away.' : 'Draft saved. Someone who can publish must approve it.');
      invalidate('pages:locationSection', 'pages', 'publishing');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHead title="Section text" icon={<FileText size={18} />} sub={data.publishedAt ? `Last published ${ago(data.publishedAt)}` : data.updatedAt ? `Last saved ${ago(data.updatedAt)}` : 'Not edited yet'}>
        {editable && (
          <Button variant="primary" icon={canPublish ? <Send size={15} /> : <Save size={15} />} busy={busy} disabled={!dirty && !(canPublish && data.hasDraft)} onClick={() => void save()}>
            {canPublish ? 'Publish' : 'Save draft'}
          </Button>
        )}
      </CardHead>
      {data.hasDraft && <div className="card-body" style={{ paddingBottom: 0 }}><Alert tone="warn">There is an unpublished draft of this text.{!canPublish && ' Someone who can publish must approve it.'}</Alert></div>}
      <fieldset disabled={!editable} style={{ border: 0, margin: 0 }} className="card-body stack">
        {SECTION_FIELDS.map((f) => {
          const v = content[f.key];
          const set = (value: unknown) => setContent({ ...content, [f.key]: value });
          return (
            <Field key={f.key} label={f.label} hint={f.hint}>
              {f.type === 'boolean' ? (
                <Toggle checked={v as boolean} onChange={(val) => set(val)} label="Enabled" />
              ) : 'long' in f ? (
                <Textarea rows={4} value={(v as string) ?? ''} onChange={(e) => set(e.target.value)} />
              ) : (
                <Input value={(v as string) ?? ''} onChange={(e) => set(e.target.value)} />
              )}
            </Field>
          );
        })}
      </fieldset>
    </Card>
  );
}

function PlaceForm({ place, origin, onClose }: { place?: Landmark; origin: LandmarkList['origin']; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState({
    name: place?.name ?? '',
    category: place?.category ?? 'BUSINESS',
    latitude: place?.latitude ?? null as number | null,
    longitude: place?.longitude ?? null as number | null,
    manualDistance: place?.manualDistance ?? false,
    visible: place?.visible ?? true,
    distanceKm: place?.distanceM != null ? place.distanceM / 1000 : null as number | null,
    driveMinutes: place?.driveMinutes ?? null as number | null,
    walkMinutes: place?.walkMinutes ?? null as number | null,
  });
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = d.name.trim().length > 0 && d.latitude !== null && d.longitude !== null && Math.abs(d.latitude) <= 90 && Math.abs(d.longitude) <= 180 && (!d.manualDistance || d.distanceKm !== null);

  const save = async () => {
    setBusy(true);
    const body = {
      name: d.name.trim(),
      category: d.category,
      latitude: d.latitude,
      longitude: d.longitude,
      manualDistance: d.manualDistance,
      visible: d.visible,
      ...(d.manualDistance
        ? { distanceM: d.distanceKm !== null ? Math.round(d.distanceKm * 1000) : null, driveMinutes: d.driveMinutes !== null ? Math.round(d.driveMinutes) : null, walkMinutes: d.walkMinutes !== null ? Math.round(d.walkMinutes) : null }
        : {}),
    };
    try {
      if (place) await patch(`/admin/landmarks/${place.id}`, body);
      else await post('/admin/landmarks', body);
      toast.success(`${body.name} saved. The website updates straight away.`);
      invalidate('landmarks');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const mapsHref = d.latitude !== null && d.longitude !== null ? `https://www.google.com/maps/dir/?api=1&origin=${origin.latitude},${origin.longitude}&destination=${d.latitude},${d.longitude}` : null;

  return (
    <Modal
      title={place ? `Edit ${place.name}` : 'New place'}
      sub="Listed and mapped in the location section of the website."
      size="lg"
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} disabled={!valid} onClick={() => void save()}>Save</Button></>}
    >
      <div className="grid-2">
        <Field label="Name"><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} autoFocus placeholder="Kigali Convention Centre" /></Field>
        <Field label="Kind"><Select value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })} options={CATEGORIES} /></Field>
      </div>
      <Field label="Position" hint="Paste coordinates from Google Maps (right-click the place → copy the numbers), or type them below.">
        <Input
          value={paste}
          placeholder="-1.9536, 30.0928"
          onChange={(e) => {
            setPaste(e.target.value);
            const p = parsePosition(e.target.value);
            if (p) setD({ ...d, latitude: p[0], longitude: p[1] });
          }}
        />
      </Field>
      <div className="grid-2">
        <Field label="Latitude"><NumberInput value={d.latitude} onChange={(v) => setD({ ...d, latitude: v })} /></Field>
        <Field label="Longitude"><NumberInput value={d.longitude} onChange={(v) => setD({ ...d, longitude: v })} /></Field>
      </div>
      {mapsHref && <a className="small" href={mapsHref} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Check the route from {origin.name || 'the site'} in Google Maps</a>}
      <Toggle checked={d.manualDistance} onChange={(v) => setD({ ...d, manualDistance: v })} label="Type the distance and times myself" />
      {d.manualDistance ? (
        <div className="grid-3">
          <Field label="Distance"><NumberInput value={d.distanceKm} onChange={(v) => setD({ ...d, distanceKm: v })} suffix="km" min={0} step="0.1" /></Field>
          <Field label="By car"><NumberInput value={d.driveMinutes} onChange={(v) => setD({ ...d, driveMinutes: v })} suffix="min" min={1} step="1" /></Field>
          <Field label="On foot" hint="Empty hides it."><NumberInput value={d.walkMinutes} onChange={(v) => setD({ ...d, walkMinutes: v })} suffix="min" min={1} step="1" /></Field>
        </div>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>The straight-line distance from the site is calculated from the position, with drive and walking times estimated from it.</p>
      )}
      <Toggle checked={d.visible} onChange={(v) => setD({ ...d, visible: v })} label="Visible on website" />
    </Modal>
  );
}

/** Website → Location — the homepage location section: its words and the places around the site. */
export default function Location() {
  const { can } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const { data, error, refetch } = useQuery('landmarks', () => get<LandmarkList>('/admin/landmarks'));
  const [edit, setEdit] = useState<Landmark | 'new' | null>(null);
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data) return <LoadingPage />;
  const editable = can('content.edit');
  const remove = async (l: Landmark) => {
    if (!(await confirm({ title: `Remove ${l.name}?`, body: 'It disappears from the list and the map on the website.', confirm: 'Remove', danger: true }))) return;
    try {
      await del(`/admin/landmarks/${l.id}`);
      toast.success(`${l.name} removed.`);
      invalidate('landmarks');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <>
      <PageHead title="Location" sub="The location section of the website: its heading, description and the places around the site." crumbs={[{ label: 'Website' }, { label: 'Location' }]}>
        <a className="btn" href={`${SITE_URL}/#location`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> View on the website</a>
      </PageHead>
      <SectionText />
      <Card>
        <CardHead title="Nearby places" icon={<MapPin size={18} />} sub={`${data.landmarks.length} listed, nearest first`}>
          {editable && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEdit('new')}>Add place</Button>}
        </CardHead>
        {data.landmarks.length === 0 ? (
          <Empty title="No places yet" icon={<MapPin size={32} />}>Add the businesses, embassies, schools and landmarks around the site.</Empty>
        ) : (
          <div className="table-wrap" style={{ padding: '0 14px 14px' }}>
            <table className="table">
              <thead><tr><th>Name</th><th>Kind</th><th>Distance</th><th>By car</th><th>On foot</th><th>Visible</th><th /></tr></thead>
              <tbody>
                {data.landmarks.map((l) => (
                  <tr key={l.id}>
                    <td><strong style={{ color: 'var(--navy)' }}>{l.name}</strong></td>
                    <td><Badge tone="sky" plain>{categoryLabel(l.category)}</Badge></td>
                    <td className="tabular nowrap">{l.distanceM !== null ? formatDistance(l.distanceM) : '—'}{l.manualDistance && <span className="muted small"> · typed</span>}</td>
                    <td className="tabular nowrap">{l.driveMinutes ? `${l.driveMinutes} min` : '—'}</td>
                    <td className="tabular nowrap">{l.walkMinutes ? `${l.walkMinutes} min` : '—'}</td>
                    <td className="tabular nowrap"><Badge tone={l.visible ? 'green' : 'amber'} plain>{l.visible ? 'Visible' : 'Hidden'}</Badge></td>
                    <td style={{ textAlign: 'right' }}>
                      {editable && (
                        <span className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                          <Button size="sm" icon={<Pencil size={14} />} onClick={() => setEdit(l)}>Edit</Button>
                          <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} aria-label={`Remove ${l.name}`} onClick={() => void remove(l)} />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {edit && <PlaceForm place={edit === 'new' ? undefined : edit} origin={data.origin} onClose={() => setEdit(null)} />}
    </>
  );
}
