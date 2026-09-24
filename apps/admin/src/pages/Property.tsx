import { useEffect, useState } from 'react';
import { Building2, HardHat, ImagePlus, MapPin, Phone, Save, X } from 'lucide-react';
import { CONSTRUCTION_STATUSES, DEVELOPMENT_STATUSES, humanise } from '@avida/types';
import { get, patch } from '../lib/api';
import { useAuth } from '../lib/auth';
import { invalidate, useQuery } from '../lib/query';
import type { MediaView } from '../lib/types';
import { MediaPicker } from '../components/Media';
import { useToast } from '../components/Toast';
import { Alert, Button, Card, CardHead, ErrorBox, Field, Input, KV, LoadingPage, MediaImg, NumberInput, PageHead, Select, Textarea } from '../components/ui';

interface Property {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  descriptionMd: string;
  city: string;
  country: string;
  addressLine: string | null;
  latitude: number;
  longitude: number;
  handoverDate: string | null;
  currency: string;
  status: string;
  propertyType: string;
  buildingConfig: string | null;
  constructionStatus: string;
  constructionPercent: number | null;
  developerName: string | null;
  architect: string | null;
  contractor: string | null;
  yearStarted: number | null;
  contactEmail: string | null;
  officeAddress: string | null;
  mapsUrl: string | null;
  officeHours: string | null;
  socials: Record<string, string> | null;
  logoMediaId: string | null;
  heroMediaId: string | null;
  mainMediaId: string | null;
  videoMediaId: string | null;
  logoMedia: MediaView | null;
  heroMedia: MediaView | null;
  mainMedia: MediaView | null;
  videoMedia: MediaView | null;
  derived: { floors: number; residences: number };
}

const SOCIALS = ['instagram', 'facebook', 'linkedin', 'youtube', 'x', 'tiktok'] as const;
type Slot = 'logoMediaId' | 'heroMediaId' | 'mainMediaId' | 'videoMediaId';

function MediaSlot({ label, media, onPick, onClear, editable, kind = 'IMAGE' }: { label: string; media: MediaView | null; onPick: () => void; onClear: () => void; editable: boolean; kind?: string }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="media-tile" style={{ aspectRatio: '16 / 9', cursor: editable ? 'pointer' : 'default' }} onClick={editable ? onPick : undefined}>
        {media ? <MediaImg m={media} sizes="300px" /> : <div className="doc"><ImagePlus size={26} />{editable ? `Choose ${kind === 'VIDEO' ? 'a video' : 'an image'}` : 'None'}</div>}
      </div>
      {media && editable && <Button size="xs" variant="ghost" icon={<X size={13} />} onClick={onClear} style={{ justifySelf: 'start' }}>Remove</Button>}
    </div>
  );
}

/** §4 — the property itself. Every field is editable and the website reads it. */
export default function PropertyPage() {
  const { can } = useAuth();
  const toast = useToast();
  const editable = can('property.edit');
  const { data, error, refetch } = useQuery('property', () => get<Property>('/admin/property'));
  const [d, setD] = useState<Property | null>(null);
  const [picker, setPicker] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setD(data);
  }, [data]);
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!d || !data) return <LoadingPage />;

  const set = <K extends keyof Property>(k: K, v: Property[K]) => setD({ ...d, [k]: v });
  const dirty = JSON.stringify(d) !== JSON.stringify(data);
  const save = async () => {
    setBusy(true);
    try {
      const keys: (keyof Property)[] = ['name', 'tagline', 'descriptionMd', 'city', 'country', 'addressLine', 'latitude', 'longitude', 'handoverDate', 'currency', 'status', 'propertyType', 'buildingConfig', 'constructionStatus', 'constructionPercent', 'developerName', 'architect', 'contractor', 'yearStarted', 'contactEmail', 'officeAddress', 'mapsUrl', 'officeHours', 'socials', 'logoMediaId', 'heroMediaId', 'mainMediaId', 'videoMediaId'];
      const body = Object.fromEntries(
        keys
          .filter((k) => JSON.stringify(d[k]) !== JSON.stringify(data[k]))
          .map((k) => {
            const v = d[k];
            return [k, typeof v === 'string' && v.trim() === '' ? null : k === 'handoverDate' && v ? new Date(String(v)).toISOString() : v];
          }),
      );
      await patch('/admin/property', body);
      toast.success('Property saved. The website updates straight away.');
      invalidate('property', 'dashboard');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title="Property overview" sub={`${d.name} · ${data.derived.floors} floors · ${data.derived.residences} residences (counted from the residence records)`}>
        {editable && (
          <>
            {dirty && <Button variant="ghost" onClick={() => setD(data)}>Discard</Button>}
            <Button variant="primary" icon={<Save size={16} />} busy={busy} disabled={!dirty} onClick={() => void save()}>Save changes</Button>
          </>
        )}
      </PageHead>
      {!editable && <Alert tone="info">Your role can read the property details but not change them.</Alert>}

      <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 24 }}>
        <div className="detail-grid">
          <Card>
            <CardHead title="The project" icon={<Building2 size={18} />} />
            <div className="card-body form-grid">
              <Field label="Property name"><Input value={d.name} onChange={(e) => set('name', e.target.value)} /></Field>
              <Field label="Tagline"><Input value={d.tagline ?? ''} onChange={(e) => set('tagline', e.target.value)} /></Field>
              <Field label="Property type"><Input value={d.propertyType} onChange={(e) => set('propertyType', e.target.value)} /></Field>
              <Field label="Building" hint="How the stack is described, e.g. B + G + 4."><Input value={d.buildingConfig ?? ''} onChange={(e) => set('buildingConfig', e.target.value)} /></Field>
              <Field label="Sales status"><Select value={d.status} onChange={(e) => set('status', e.target.value)} options={DEVELOPMENT_STATUSES.map((s) => ({ value: s, label: humanise(s) }))} /></Field>
              <Field label="Currency"><Select value={d.currency} onChange={(e) => set('currency', e.target.value)} options={['USD', 'RWF', 'EUR', 'GBP', 'KES'].map((c) => ({ value: c, label: c }))} /></Field>
              <Field label="Project description" className="full" hint="The About section of the website. Blank lines start new paragraphs.">
                <Textarea rows={10} value={d.descriptionMd} onChange={(e) => set('descriptionMd', e.target.value)} />
              </Field>
            </div>
          </Card>
          <Card>
            <CardHead title="Counted, not typed" sub="These follow the records automatically." />
            <div className="card-body">
              <KV items={[['Floors', data.derived.floors], ['Residences', data.derived.residences], ['Slug', d.slug]]} />
            </div>
          </Card>
        </div>

        <div className="grid-2">
          <Card>
            <CardHead title="Location" icon={<MapPin size={18} />} />
            <div className="card-body form-grid">
              <Field label="Address" className="full"><Input value={d.addressLine ?? ''} onChange={(e) => set('addressLine', e.target.value)} /></Field>
              <Field label="City"><Input value={d.city} onChange={(e) => set('city', e.target.value)} /></Field>
              <Field label="Country" hint="Two-letter code, e.g. RW."><Input value={d.country} onChange={(e) => set('country', e.target.value.toUpperCase())} maxLength={80} /></Field>
              <Field label="Latitude"><NumberInput value={d.latitude} onChange={(v) => set('latitude', v ?? 0)} /></Field>
              <Field label="Longitude"><NumberInput value={d.longitude} onChange={(v) => set('longitude', v ?? 0)} /></Field>
              <div className="full">
                <a href={`https://www.openstreetmap.org/?mlat=${d.latitude}&mlon=${d.longitude}#map=17/${d.latitude}/${d.longitude}`} target="_blank" rel="noreferrer" className="small">Check the pin on a map</a>
              </div>
            </div>
          </Card>
          <Card>
            <CardHead title="Construction" icon={<HardHat size={18} />} />
            <div className="card-body form-grid">
              <Field label="Construction status"><Select value={d.constructionStatus} onChange={(e) => set('constructionStatus', e.target.value)} options={CONSTRUCTION_STATUSES.map((s) => ({ value: s, label: humanise(s) }))} /></Field>
              <Field label="Complete"><NumberInput value={d.constructionPercent} suffix="%" min={0} max={100} step="1" onChange={(v) => set('constructionPercent', v)} /></Field>
              <Field label="Year started"><NumberInput value={d.yearStarted} step="1" onChange={(v) => set('yearStarted', v)} /></Field>
              <Field label="Expected completion"><Input type="date" value={d.handoverDate?.slice(0, 10) ?? ''} onChange={(e) => set('handoverDate', e.target.value || null)} /></Field>
              <Field label="Developer"><Input value={d.developerName ?? ''} onChange={(e) => set('developerName', e.target.value)} /></Field>
              <Field label="Architect"><Input value={d.architect ?? ''} onChange={(e) => set('architect', e.target.value)} /></Field>
              <Field label="Contractor" className="full"><Input value={d.contractor ?? ''} onChange={(e) => set('contractor', e.target.value)} /></Field>
            </div>
          </Card>
        </div>

        <Card>
          <CardHead title="Images and film" icon={<ImagePlus size={18} />} sub="Chosen from the media library, or uploaded from the picker." />
          <div className="card-body grid-4">
            <MediaSlot label="Logo" media={d.logoMedia} editable={editable} onPick={() => setPicker('logoMediaId')} onClear={() => setD({ ...d, logoMediaId: null, logoMedia: null })} />
            <MediaSlot label="Hero image" media={d.heroMedia} editable={editable} onPick={() => setPicker('heroMediaId')} onClear={() => setD({ ...d, heroMediaId: null, heroMedia: null })} />
            <MediaSlot label="Main property image" media={d.mainMedia} editable={editable} onPick={() => setPicker('mainMediaId')} onClear={() => setD({ ...d, mainMediaId: null, mainMedia: null })} />
            <MediaSlot label="Project video" kind="VIDEO" media={d.videoMedia} editable={editable} onPick={() => setPicker('videoMediaId')} onClear={() => setD({ ...d, videoMediaId: null, videoMedia: null })} />
          </div>
        </Card>

        <Card>
          <CardHead
            title="Contact information"
            icon={<Phone size={18} />}
            sub="The email, the sales office and the social links the website shows. The telephone and WhatsApp numbers are under Website → WhatsApp & Telephone."
          />
          <div className="card-body form-grid three">
            <Field label="Email"><Input type="email" value={d.contactEmail ?? ''} onChange={(e) => set('contactEmail', e.target.value)} placeholder="sales@…" /></Field>
            <Field label="Sales office address" className="full"><Input value={d.officeAddress ?? ''} onChange={(e) => set('officeAddress', e.target.value)} /></Field>
            <Field label="Google Maps link" hint="The footer and contact blocks link the address here." className="full"><Input type="url" value={d.mapsUrl ?? ''} onChange={(e) => set('mapsUrl', e.target.value)} placeholder="https://maps.app.goo.gl/…" /></Field>
            <Field label="Office hours" className="full"><Input value={d.officeHours ?? ''} onChange={(e) => set('officeHours', e.target.value)} placeholder="Mon–Sat, 9:00–18:00" /></Field>
            {SOCIALS.map((s) => (
              <Field key={s} label={s === 'x' ? 'X (Twitter)' : s[0]!.toUpperCase() + s.slice(1)}>
                <Input value={d.socials?.[s] ?? ''} placeholder="https://…" onChange={(e) => set('socials', { ...(d.socials ?? {}), [s]: e.target.value })} />
              </Field>
            ))}
          </div>
        </Card>
      </fieldset>

      {picker && (
        <MediaPicker
          kind={picker === 'videoMediaId' ? 'VIDEO' : 'IMAGE'}
          onClose={() => setPicker(null)}
          onPick={([m]) => {
            if (!m) return;
            const mediaKey = picker.replace('Id', '') as 'logoMedia' | 'heroMedia' | 'mainMedia' | 'videoMedia';
            setD({ ...d, [picker]: m.id, [mediaKey]: m });
          }}
        />
      )}
    </>
  );
}
