import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  CircleDollarSign,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  History,
  Inbox,
  MoreVertical,
  Plus,
  RotateCcw,
  Save,
  Send,
  Star,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { humanise, ROOM_TYPES, STATUS_LABEL } from '@avida/types';
import { del, get, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago, area, code as fmtCode, date, dateTime, ENQUIRY_TONE, money, ORIENTATION_TEXT, STAGE_TONE, STATUS_TONE } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { floorName } from '../lib/ref';
import { Link, navigate, useSearchState } from '../lib/router';
import type { MediaView, Paged, ResidenceDetail as Detail, Room } from '../lib/types';
import { InlinePrice } from '../components/InlinePrice';
import { IMAGE_ACCEPT, invalidateMedia, MediaEditor, MediaGrid, MediaUploader, PLAN_ACCEPT, VIDEO_ACCEPT } from '../components/Media';
import { BasicFields, DescriptionFields, FeaturePicker, PricingFields, SizeFields, toBody, validate, type Errors, type ResidenceDraft } from '../components/ResidenceFields';
import { StatusSelect } from '../components/StatusSelect';
import { useToast } from '../components/Toast';
import { Alert, Badge, Button, Card, CardHead, Empty, ErrorBox, Field, Input, KV, LoadingPage, MediaImg, Menu, Modal, NumberInput, PageHead, Select, StatusBadge, Tabs, Textarea, Toggle, useConfirm } from '../components/ui';

const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined) || 'http://localhost:3000';
const residenceSlug = (code: string) => code.toLowerCase().replace(/[^a-z0-9]+/g, '-');

type Tab = 'overview' | 'pricing' | 'specs' | 'plan' | 'images' | 'videos' | 'features' | 'rooms' | 'people' | 'enquiries' | 'activity' | 'preview';

function draftOf(u: Detail): ResidenceDraft {
  return {
    code: u.code,
    floorId: u.floorId,
    typologyId: u.typologyId,
    bedrooms: u.bedrooms,
    bathrooms: u.bathrooms,
    areaSqm: u.areaSqm,
    interiorSqm: u.interiorSqm,
    balconySqm: u.balconySqm,
    terraceSqm: u.terraceSqm,
    exteriorSqm: u.exteriorSqm,
    parkingIncluded: u.parkingIncluded,
    hasStorage: u.hasStorage,
    storageNote: u.storageNote ?? '',
    orientation: u.orientation,
    viewTags: u.viewTags,
    availabilityDate: u.availabilityDate?.slice(0, 10) ?? '',
    shortDescription: u.shortDescription ?? '',
    description: u.description ?? '',
    priceMinor: u.priceMinor,
    currency: u.currency,
    discountMinor: u.discountMinor,
    promoPriceMinor: u.promoPriceMinor,
    promoEndsAt: u.promoEndsAt?.slice(0, 10) ?? '',
    reservationFeeMinor: u.reservationFeeMinor,
    depositPercent: u.depositPercent,
    paymentPlanId: u.paymentPlanId ?? '',
    featureIds: u.features.map((f) => f.id),
    published: u.published,
    featured: u.featured,
    tags: u.tags,
    notes: u.notes ?? '',
  };
}

const PRICE_KEYS = ['priceMinor', 'currency', 'discountMinor', 'promoPriceMinor', 'promoEndsAt', 'reservationFeeMinor', 'depositPercent', 'paymentPlanId'];

/** Only the fields that changed, so a save never touches what the person did not edit. */
function changes(before: ResidenceDraft, after: ResidenceDraft): Record<string, unknown> {
  const a = toBody(after) as Record<string, unknown>;
  const b = toBody(before) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(a).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(b[k])));
}

// ─── Tabs ────────────────────────────────────────────────────────────────

function MediaTab({ u, collection, kind, accept, title, hint }: { u: Detail; collection: 'LIBRARY' | 'FLOOR_PLAN'; kind?: 'IMAGE' | 'VIDEO'; accept: string; title: string; hint: string }) {
  const { can } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState<MediaView | null>(null);
  const items = u.media.filter((m) => m.collection === collection && (!kind || m.kind === kind || (collection === 'FLOOR_PLAN')));
  const reorder = async (ids: string[]) => {
    try {
      await post('/admin/assets/reorder', { ids });
      invalidateMedia();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div className="stack">
      {can('media.edit') && <MediaUploader fields={{ unitId: u.id, collection, category: collection === 'FLOOR_PLAN' ? 'RESIDENCE_PLAN' : kind === 'VIDEO' ? 'INTERIOR' : 'INTERIOR' }} accept={accept} title={title} hint={hint} />}
      {items.length > 1 && can('media.edit') && <p className="muted small" style={{ margin: 0 }}>Drag to reorder. The order here is the order on the website.</p>}
      <MediaGrid items={items} onOpen={setOpen} onReorder={can('media.edit') ? (ids) => void reorder(ids) : undefined} empty={<Empty title="Nothing uploaded yet">{collection === 'FLOOR_PLAN' ? 'Until this residence has its own plan, the website shows the plan of its type.' : 'Until this residence has its own photographs, the website shows those of its type.'}</Empty>} />
      {open && <MediaEditor media={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function RoomsTab({ u, refetch }: { u: Detail; refetch: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', type: 'BEDROOM', areaSqm: null as number | null });
  const editable = can('room.edit');
  const save = async (room: Room, data: Partial<Room>) => {
    try {
      await patch(`/admin/rooms/${room.id}`, data);
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const move = async (i: number, dir: -1 | 1) => {
    const ids = u.rooms.map((r) => r.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    await post(`/admin/residences/${u.id}/rooms/reorder`, { ids });
    refetch();
  };
  const total = u.rooms.reduce((a, r) => a + (r.areaSqm ?? 0), 0);
  return (
    <div className="stack">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 70 }} />
              <th>Room</th>
              <th>Type</th>
              <th className="num">Area</th>
              <th>Description</th>
              <th className="actions" />
            </tr>
          </thead>
          <tbody>
            {u.rooms.map((r, i) => (
              <tr key={r.id}>
                <td>
                  {editable && (
                    <span className="row" style={{ gap: 2 }}>
                      <Button size="xs" variant="ghost" icon={<ArrowUp size={13} />} aria-label="Move up" disabled={i === 0} onClick={() => void move(i, -1)} />
                      <Button size="xs" variant="ghost" icon={<ArrowDown size={13} />} aria-label="Move down" disabled={i === u.rooms.length - 1} onClick={() => void move(i, 1)} />
                    </span>
                  )}
                </td>
                <td>{editable ? <Input className="sm" defaultValue={r.name} onBlur={(e) => e.target.value !== r.name && void save(r, { name: e.target.value })} /> : r.name}</td>
                <td>{editable ? <Select className="sm" value={r.type} onChange={(e) => void save(r, { type: e.target.value })} options={ROOM_TYPES.map((t) => ({ value: t, label: humanise(t) }))} /> : humanise(r.type)}</td>
                <td className="num" style={{ width: 120 }}>{editable ? <NumberInput value={r.areaSqm} suffix="m²" onChange={() => {}} onBlur={(e) => { const n = e.target.value === '' ? null : Number(e.target.value); if (n !== r.areaSqm) void save(r, { areaSqm: n }); }} /> : area(r.areaSqm)}</td>
                <td>{editable ? <Input className="sm" defaultValue={r.description ?? ''} placeholder="Optional" onBlur={(e) => e.target.value !== (r.description ?? '') && void save(r, { description: e.target.value || null })} /> : r.description}</td>
                <td className="actions">
                  {editable && (
                    <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} aria-label={`Remove ${r.name}`} onClick={async () => {
                      if (!(await confirm({ title: `Remove ${r.name}?`, body: 'Its photographs stay with the residence.', confirm: 'Remove', danger: true }))) return;
                      await del(`/admin/rooms/${r.id}`);
                      refetch();
                    }} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row muted small">Rooms add up to {area(total)} of {area(u.areaSqm)}.</div>
      {editable && (adding ? (
        <Card pad className="form-grid three">
          <Field label="Name"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Bedroom 2" autoFocus /></Field>
          <Field label="Type"><Select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })} options={ROOM_TYPES.map((t) => ({ value: t, label: humanise(t) }))} /></Field>
          <Field label="Area"><NumberInput value={draft.areaSqm} suffix="m²" onChange={(v) => setDraft({ ...draft, areaSqm: v })} /></Field>
          <div className="row full">
            <Button variant="primary" disabled={!draft.name.trim()} onClick={async () => {
              try {
                await post(`/admin/residences/${u.id}/rooms`, draft);
                setDraft({ name: '', type: 'BEDROOM', areaSqm: null });
                setAdding(false);
                refetch();
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}>Add room</Button>
            <Button onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </Card>
      ) : (
        <Button icon={<Plus size={16} />} onClick={() => setAdding(true)} style={{ justifySelf: 'start' }}>Add a room or space</Button>
      ))}
    </div>
  );
}

function PeopleTab({ u, refetch }: { u: Detail; refetch: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const [assign, setAssign] = useState<'buyer' | 'resident' | null>(null);
  const [choice, setChoice] = useState('');
  const { data: buyers } = useQuery(assign === 'buyer' ? 'buyers:picker' : null, () => get<Paged<{ id: string; fullName: string; stage: string }>>('/admin/buyers?pageSize=200'));
  const { data: residents } = useQuery(assign === 'resident' ? 'residents:picker' : null, () => get<Paged<{ id: string; fullName: string; unit: { code: string } | null }>>('/admin/residents?pageSize=200'));
  const canBuyers = can('buyer.view');
  const canResidents = can('resident.view');
  const sold = u.status === 'SOLD' || u.status === 'OCCUPIED';

  const doAssign = async () => {
    try {
      if (assign === 'buyer') await patch(`/admin/residences/${u.id}`, { buyerId: choice || null });
      else await post(`/admin/residents/${choice}/assign`, { unitId: u.id });
      toast.success('Saved.');
      setAssign(null);
      setChoice('');
      invalidate('residents', 'buyers');
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <Card>
        <CardHead title="Buyer" icon={<UserPlus size={18} />}>
          {can('buyer.edit') && <Button size="sm" onClick={() => setAssign('buyer')}>{u.buyer ? 'Change' : 'Assign buyer'}</Button>}
        </CardHead>
        <div className="card-body">
          {!canBuyers && <p className="muted small">Your role cannot see buyer details.</p>}
          {canBuyers && u.buyer && !u.buyer.restricted && (
            <KV items={[
              ['Name', <Link to={`/buyers/${u.buyer.id}`}>{u.buyer.fullName}</Link>],
              ['Stage', <Badge tone={STAGE_TONE[u.buyer.stage]}>{humanise(u.buyer.stage)}</Badge>],
              ['Email', u.buyer.email ?? '—'],
              ['Phone', u.buyer.phone ?? '—'],
            ]} />
          )}
          {canBuyers && !u.buyer && <p className="muted small">No buyer assigned.</p>}
          {canBuyers && u.interests.length > 0 && (
            <>
              <hr className="divider" style={{ margin: '14px 0' }} />
              <div className="label" style={{ marginBottom: 8 }}>Interested clients</div>
              <div className="row-wrap">{u.interests.map((b) => <Link key={b.id} to={`/buyers/${b.id}`} className="chip">{b.fullName}</Link>)}</div>
            </>
          )}
        </div>
      </Card>
      <Card>
        <CardHead title="Residents" icon={<UserPlus size={18} />}>
          {can('resident.edit') && sold && <Button size="sm" onClick={() => setAssign('resident')}>Move someone in</Button>}
        </CardHead>
        <div className="card-body stack-sm">
          {!canResidents && <p className="muted small">Your role cannot see resident details.</p>}
          {canResidents && u.residents.length === 0 && <p className="muted small">{sold ? 'Nobody lives here yet.' : 'A residence must be sold before someone can live in it.'}</p>}
          {canResidents && u.residents.map((r) => (
            <div key={r.id} className="row">
              <Link to={`/residents/${r.id}`} className="cell-strong">{r.fullName}</Link>
              <Badge tone={r.occupancyStatus === 'ACTIVE' ? 'green' : 'grey'} plain>{humanise(r.occupancyStatus ?? '')}</Badge>
              <span className="muted small">{humanise(r.residentType ?? '')}</span>
            </div>
          ))}
        </div>
      </Card>
      {assign && (
        <Modal title={assign === 'buyer' ? `Buyer of ${fmtCode(u.code)}` : `Move a resident into ${fmtCode(u.code)}`} onClose={() => setAssign(null)} footer={<><Button onClick={() => setAssign(null)}>Cancel</Button><Button variant="primary" disabled={assign === 'resident' && !choice} onClick={() => void doAssign()}>Save</Button></>}>
          <Field label={assign === 'buyer' ? 'Client' : 'Resident'} hint={assign === 'buyer' ? <>Not listed? <Link to="/buyers?new=1">Add a client</Link> first.</> : <>Not listed? <Link to="/residents?new=1">Add a resident</Link> first.</>}>
            <Select value={choice} onChange={(e) => setChoice(e.target.value)} placeholder={assign === 'buyer' ? 'No buyer' : 'Choose a resident'} options={assign === 'buyer' ? (buyers?.data ?? []).map((b) => ({ value: b.id, label: `${b.fullName} — ${humanise(b.stage)}` })) : (residents?.data ?? []).map((r) => ({ value: r.id, label: `${r.fullName}${r.unit ? ` (now in ${r.unit.code})` : ''}` }))} />
          </Field>
        </Modal>
      )}
    </div>
  );
}

function ActivityTab({ u }: { u: Detail }) {
  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <Card>
        <CardHead title="Every change" icon={<History size={18} />} />
        <div className="card-body timeline">
          {u.activity.length === 0 && <p className="muted small">No changes recorded yet.</p>}
          {u.activity.map((a) => (
            <div key={a.id} className="timeline-item">
              <span className="timeline-dot tone-sky" />
              <div>
                <strong style={{ fontSize: 13 }}>{a.summary ?? a.action}</strong>
                <div className="muted small">{a.actorName} · {dateTime(a.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <div className="stack">
        <Card>
          <CardHead title="Status history" />
          <div className="card-body">
            {u.statusLog.length === 0 && <p className="muted small">Status has not changed since the residence was created.</p>}
            {u.statusLog.map((s) => (
              <div key={s.id} className="row" style={{ padding: '8px 0', borderTop: '1px solid var(--line-2)' }}>
                <StatusBadge status={s.from} /> → <StatusBadge status={s.to} />
                <span className="spacer" />
                <span className="muted small" style={{ textAlign: 'right' }}>{s.actorName}<br />{date(s.createdAt)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHead title="Price history" />
          <div className="card-body">
            {u.priceHistory.length === 0 && <p className="muted small">The price has not changed.</p>}
            {u.priceHistory.map((p) => (
              <div key={p.id} className="row" style={{ padding: '8px 0', borderTop: '1px solid var(--line-2)' }}>
                <span className="tabular">{money(p.fromMinor, p.currency)} → <strong>{money(p.toMinor, p.currency)}</strong></span>
                <span className="spacer" />
                <span className="muted small" style={{ textAlign: 'right' }}>{p.actorName} · {date(p.createdAt)}{p.reason && <><br />{p.reason}</>}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

interface PublicResidence {
  label: string;
  status: string;
  priceMinor: number | null;
  listPriceMinor: number | null;
  currency: string;
  bedrooms: number;
  bathrooms: number;
  areaSqm: number;
  orientation: string;
  floor: { label: string };
  type: { name: string; isPenthouse: boolean };
  shortDescription: string | null;
  description: string | null;
  images: MediaView[];
  floorPlans: MediaView[];
  features: { name: string }[];
  rooms: { name: string; areaSqm: number | null }[];
  preview?: { published: boolean };
}

/** §38 — the residence exactly as the website presents it. */
function PreviewTab({ u }: { u: Detail }) {
  const { data: p, error } = useQuery(`residence:${u.id}:preview`, () => get<PublicResidence>(`/admin/residences/${u.id}/preview`));
  if (error) return <ErrorBox error={error} />;
  if (!p) return <LoadingPage />;
  const statusText: Record<string, string> = { available: 'Available', reserved: 'Reserved', sold: 'Sold', unavailable: 'Unavailable' };
  return (
    <div className="stack">
      {!p.preview?.published && <Alert tone="warn" icon={<EyeOff size={18} />}>This residence is hidden. Visitors see nothing until it is published — this is how it will look.</Alert>}
      <div className="preview-frame">
        <div className="pv-hero">{p.images[0] && <MediaImg m={p.images[0]} sizes="900px" />}</div>
        <div className="pv-body">
          <div className="pv-kicker">Almasi Residences · {p.floor.label}</div>
          <h2>Residence {p.label}</h2>
          <div style={{ fontSize: 18, color: '#57504a' }}>{p.type.isPenthouse ? 'Penthouse' : `${p.bedrooms} bedroom apartment`}</div>
          <span className="pv-status">{statusText[p.status] ?? p.status}</span>
          <div className="pv-facts">
            <span><strong>{p.areaSqm} m²</strong>Size</span>
            <span><strong>{p.bedrooms}</strong>Bedrooms</span>
            <span><strong>{p.bathrooms}</strong>Bathrooms</span>
            <span><strong>{ORIENTATION_TEXT[p.orientation]}</strong>Aspect</span>
            <span><strong>{p.priceMinor !== null ? money(p.priceMinor, p.currency) : 'On request'}</strong>{p.listPriceMinor ? <s>{money(p.listPriceMinor, p.currency)}</s> : 'Price'}</span>
          </div>
          {p.shortDescription && <p style={{ margin: 0, fontSize: 17 }}>{p.shortDescription}</p>}
          {p.description && <p style={{ margin: 0, color: '#57504a', whiteSpace: 'pre-line' }}>{p.description}</p>}
          <div className="pv-actions">
            <span className="pv-btn">View floor plan{p.floorPlans.length ? '' : ' (none yet)'}</span>
            <span className="pv-btn">View gallery ({p.images.length})</span>
            <span className="pv-btn solid">Enquire now</span>
          </div>
          {p.features.length > 0 && <p style={{ margin: 0, font: '500 13px var(--font)', color: '#57504a' }}>{p.features.map((f) => f.name).join(' · ')}</p>}
        </div>
      </div>
      <p className="muted small">Prices are shown to visitors only while a residence is available. Resident, buyer and internal notes never appear.</p>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────

export default function ResidenceDetail({ params }: { params: Record<string, string> }) {
  const id = params.id!;
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [s, setS] = useSearchState({ tab: 'overview' });
  const tab = s.tab as Tab;
  const { data: u, error, refetch } = useQuery(`residence:${id}`, () => get<Detail>(`/admin/residences/${id}`));
  const [draft, setDraft] = useState<ResidenceDraft | null>(null);
  const [base, setBase] = useState<ResidenceDraft | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (u) {
      const d = draftOf(u);
      setBase(d);
      setDraft((cur) => (cur && base && JSON.stringify(cur) !== JSON.stringify(base) ? cur : d));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [u]);

  const diff = useMemo(() => (draft && base ? changes(base, draft) : {}), [draft, base]);
  const dirty = Object.keys(diff).length > 0;

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!u || !draft) return <LoadingPage />;

  const set = <K extends keyof ResidenceDraft>(k: K, v: ResidenceDraft[K]) => {
    setDraft((cur) => ({ ...cur!, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const save = async (publish?: boolean) => {
    const e = validate(draft);
    if (Object.keys(e).length) {
      setErrors(e);
      toast.error('Some fields need attention.');
      return;
    }
    const body: Record<string, unknown> = { ...diff };
    if (publish !== undefined) body.published = publish;
    if (!Object.keys(body).length) return;
    const priceBits = Object.keys(body).filter((k) => PRICE_KEYS.includes(k));
    const rest = Object.fromEntries(Object.entries(body).filter(([k]) => !PRICE_KEYS.includes(k)));
    setBusy(true);
    try {
      if (priceBits.length) await post(`/admin/residences/${id}/price`, { ...Object.fromEntries(priceBits.map((k) => [k, body[k]])), reason: reason || undefined });
      if (Object.keys(rest).length) await patch(`/admin/residences/${id}`, rest);
      toast.success(publish === true ? 'Saved and published.' : publish === false ? 'Unpublished.' : 'Changes saved.');
      setReason('');
      setBase(null);
      setDraft(null);
      invalidate('residences', `residence:${id}`, 'dashboard', 'building', 'floors', 'floor:', 'types');
    } catch (err) {
      toast.error((err as Error).message);
      if (/code/i.test((err as Error).message)) setErrors({ code: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const archived = Boolean(u.archivedAt);
  const lifecycle = async (action: 'archive' | 'restore' | 'delete' | 'duplicate') => {
    try {
      if (action === 'archive') {
        if (!(await confirm({ title: `Archive ${fmtCode(u.code)}?`, body: 'It disappears from the website. Its media, enquiries and history are kept, and you can restore it at any time.', confirm: 'Archive residence', danger: true }))) return;
        await post(`/admin/residences/${id}/archive`);
      } else if (action === 'restore') await post(`/admin/residences/${id}/restore`);
      else if (action === 'delete') {
        if (!(await confirm({ title: `Delete ${fmtCode(u.code)} permanently?`, body: 'Only a residence created by mistake — never sold, no enquiries, no buyer — can be deleted.', confirm: 'Delete permanently', danger: true, typeToConfirm: u.code }))) return;
        await del(`/admin/residences/${id}`);
        invalidate('residences', 'dashboard', 'building', 'floors');
        toast.success('Deleted.');
        navigate('/residences?archived=true');
        return;
      } else {
        const code = window.prompt(`Unit code for the copy of ${fmtCode(u.code)}`, `${u.code}-COPY`);
        if (!code) return;
        const copy = await post<{ id: string }>(`/admin/residences/${id}/duplicate`, { code: code.toUpperCase() });
        invalidate('residences');
        toast.success(`Created ${code.toUpperCase()}, hidden until you publish it.`);
        navigate(`/residences/${copy.id}`);
        return;
      }
      toast.success(action === 'archive' ? 'Archived.' : 'Restored — publish it when ready.');
      invalidate('residences', `residence:${id}`, 'dashboard', 'building', 'floors');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const cover = u.media.find((m) => m.isCover && m.collection === 'LIBRARY') ?? u.media.find((m) => m.collection === 'LIBRARY' && m.kind === 'IMAGE');
  const counts = {
    plan: u.media.filter((m) => m.collection === 'FLOOR_PLAN').length,
    images: u.media.filter((m) => m.collection === 'LIBRARY' && m.kind === 'IMAGE').length,
    videos: u.media.filter((m) => m.kind === 'VIDEO').length,
  };
  const editable = can('residence.edit') && !archived;

  return (
    <>
      <PageHead
        title={<span className="row" style={{ gap: 12 }}>Residence {fmtCode(u.code)} {u.featured && <Star size={18} fill="var(--gold)" color="var(--gold)" aria-label="Featured" />}</span>}
        crumbs={[{ label: 'Residences', to: '/residences' }, { label: floorName(u.floor), to: `/floors/${u.floorId}` }, { label: fmtCode(u.code) }]}
        sub={`${u.typology.name} · ${floorName(u.floor)} · ${area(u.areaSqm)}`}
      >
        {archived ? <Badge tone="grey">Archived</Badge> : u.published ? <Badge tone="green">Published</Badge> : <Badge tone="grey">Hidden from the website</Badge>}
        {u.published && !archived && (
          <a className="btn" href={`${SITE_URL}/residences/${residenceSlug(u.code)}`} target="_blank" rel="noreferrer">
            <ExternalLink size={15} /> View on website
          </a>
        )}
        <Menu trigger={(t) => <Button icon={<MoreVertical size={17} />} onClick={t} aria-label="More actions" />}>
          {(close) => (
            <>
              <button type="button" onClick={() => { close(); setS({ tab: 'preview' }); }}><Eye size={15} /> Public preview</button>
              {can('residence.edit') && <button type="button" onClick={() => { close(); void lifecycle('duplicate'); }}><Copy size={15} /> Duplicate</button>}
              {can('residence.delete') && (
                <>
                  <hr />
                  {archived ? (
                    <>
                      <button type="button" onClick={() => { close(); void lifecycle('restore'); }}><RotateCcw size={15} /> Restore</button>
                      <button type="button" className="danger" onClick={() => { close(); void lifecycle('delete'); }}><Trash2 size={15} /> Delete permanently</button>
                    </>
                  ) : (
                    <button type="button" className="danger" onClick={() => { close(); void lifecycle('archive'); }}><Archive size={15} /> Archive</button>
                  )}
                </>
              )}
            </>
          )}
        </Menu>
      </PageHead>

      {archived && <Alert tone="warn" icon={<Archive size={18} />}>This residence is archived and hidden everywhere. Restore it to edit or publish it.</Alert>}

      <div className="sticky-actions">
        <StatusSelect id={u.id} code={u.code} status={u.status} disabled={archived} onChanged={refetch} />
        <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 17, color: 'var(--navy)' }}>
          <InlinePrice id={u.id} code={u.code} priceMinor={u.priceMinor} currency={u.currency} effectiveMinor={u.effectivePriceMinor} />
        </span>
        {u.pricePerSqmMinor && <span className="muted small">{money(u.pricePerSqmMinor, u.currency)} / m²</span>}
        <span className="spacer" />
        {dirty && <span className="row small" style={{ gap: 6, color: 'var(--orange)' }}><span className="dirty-dot" /> Unsaved changes</span>}
        {dirty && <Button variant="ghost" onClick={() => { setDraft(base); setErrors({}); }}>Discard</Button>}
        {editable && (
          <>
            <Button icon={<Save size={16} />} busy={busy} disabled={!dirty} onClick={() => void save()}>Save changes</Button>
            {u.published ? (
              <Button icon={<EyeOff size={16} />} onClick={() => void save(false)}>Unpublish</Button>
            ) : (
              <Button variant="primary" icon={<Send size={16} />} busy={busy} onClick={() => void save(true)}>Save & publish</Button>
            )}
          </>
        )}
      </div>

      <Tabs
        value={tab}
        onChange={(t) => setS({ tab: t })}
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'pricing', label: 'Pricing' },
          { value: 'specs', label: 'Specifications' },
          { value: 'plan', label: 'Floor plan', count: counts.plan },
          { value: 'images', label: 'Images', count: counts.images },
          { value: 'videos', label: 'Videos', count: counts.videos },
          { value: 'features', label: 'Features', count: u.features.length },
          { value: 'rooms', label: 'Rooms', count: u.rooms.length },
          { value: 'people', label: 'Resident / buyer' },
          { value: 'enquiries', label: 'Enquiries', count: u.enquiryCount, hidden: !can('enquiry.view') },
          { value: 'activity', label: 'Activity' },
          { value: 'preview', label: 'Public preview' },
        ]}
      />

      {tab === 'overview' && (
        <div className="detail-grid">
          <div className="stack">
            <Card pad className="stack">
              <h3>Basic information</h3>
              <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0 }}><BasicFields d={draft} set={set} errors={errors} /></fieldset>
            </Card>
            <Card pad className="stack">
              <h3>Description</h3>
              <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0 }}><DescriptionFields d={draft} set={set} /></fieldset>
            </Card>
            <Card pad className="stack">
              <h3>Internal</h3>
              <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0 }} className="form-grid">
                <Field label="Internal notes" className="full" hint="Private. Never shown on the website.">
                  <Textarea rows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
                </Field>
                <Field label="Tags" hint="Separate with commas. For filtering in the admin only.">
                  <Input value={draft.tags.join(', ')} onChange={(e) => set('tags', e.target.value.split(',').map((t) => t.trim()).filter(Boolean))} />
                </Field>
                <div className="field">
                  <span>Homepage</span>
                  <Toggle checked={draft.featured} onChange={(v) => set('featured', v)} label="Featured residence" />
                </div>
              </fieldset>
            </Card>
          </div>
          <div className="stack">
            <Card>
              <div className="featured-photo" style={{ borderRadius: '14px 14px 0 0' }}>
                {cover ? <MediaImg m={cover} sizes="340px" /> : <Empty title="No cover photograph" />}
              </div>
              <div className="card-body" style={{ paddingTop: 16 }}>
                <KV items={[
                  ['Status', <StatusBadge status={u.status} />],
                  ['Price now', money(u.effectivePriceMinor, u.currency)],
                  ['Bedrooms', u.bedrooms],
                  ['Bathrooms', u.bathrooms],
                  ['Size', area(u.areaSqm)],
                  ['Aspect', ORIENTATION_TEXT[u.orientation]],
                  ['Parking', u.parkingSpaces.map((p) => p.code).join(', ') || `${u.parkingIncluded} included`],
                  ['Enquiries', u.enquiryCount],
                  ['Last updated', ago(u.updatedAt)],
                ]} />
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'pricing' && (
        <div className="detail-grid">
          <Card pad className="stack">
            <h3>Price and payment</h3>
            {!can('residence.price') && <Alert tone="info">Your role can see prices but not change them.</Alert>}
            <fieldset disabled={!can('residence.price') || archived} style={{ border: 0, padding: 0, margin: 0 }} className="stack">
              <PricingFields d={draft} set={set} errors={errors} />
              {Object.keys(diff).some((k) => PRICE_KEYS.includes(k)) && (
                <Field label="Reason for the change" hint="Recorded in the price history.">
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Market review, promotion…" />
                </Field>
              )}
            </fieldset>
            {u.schedule && (
              <>
                <h3 style={{ marginTop: 8 }}>Payment schedule — {u.paymentPlan?.name}{u.paymentPlanIsDefault ? ' (default plan)' : ''}</h3>
                <table className="table">
                  <thead><tr><th>Milestone</th><th className="num">%</th><th className="num">Amount</th><th>Due</th></tr></thead>
                  <tbody>
                    {u.schedule.rows.map((r) => (
                      <tr key={r.label}><td>{r.label}</td><td className="num">{r.percent}%</td><td className="num">{money(r.amountMinor, u.schedule!.currency)}</td><td className="muted">{r.dueDate ? date(r.dueDate) : r.triggerNote ?? '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </Card>
          <Card>
            <CardHead title="Price history" icon={<CircleDollarSign size={18} />} />
            <div className="card-body">
              <div className="row" style={{ padding: '6px 0 12px' }}>
                <span className="muted">Current price</span>
                <span className="spacer" />
                <strong style={{ fontSize: 18, fontFamily: 'var(--display)' }}>{money(u.priceMinor, u.currency)}</strong>
              </div>
              {u.priceHistory.length === 0 && <p className="muted small">No changes yet.</p>}
              {u.priceHistory.map((p) => (
                <div key={p.id} style={{ padding: '10px 0', borderTop: '1px solid var(--line-2)' }}>
                  <div className="tabular">{money(p.fromMinor, p.currency)} → <strong>{money(p.toMinor, p.currency)}</strong></div>
                  <div className="muted small">{date(p.createdAt)} · {p.actorName}{p.reason ? ` · ${p.reason}` : ''}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === 'specs' && (
        <Card pad className="stack">
          <h3>Size and specifications</h3>
          <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0 }}><SizeFields d={draft} set={set} errors={errors} /></fieldset>
        </Card>
      )}

      {tab === 'plan' && (
        <Card pad>
          <MediaTab u={u} collection="FLOOR_PLAN" accept={PLAN_ACCEPT} title="Upload a floor plan" hint="Image, PDF or 3D model. Replacing a plan keeps its place on the website." />
        </Card>
      )}
      {tab === 'images' && (
        <Card pad>
          <MediaTab u={u} collection="LIBRARY" kind="IMAGE" accept={IMAGE_ACCEPT} title="Drag photographs here" hint="Bulk upload is fine. Click an image to set the cover, caption or alt text." />
        </Card>
      )}
      {tab === 'videos' && (
        <Card pad>
          <MediaTab u={u} collection="LIBRARY" kind="VIDEO" accept={VIDEO_ACCEPT} title="Upload a video" hint="MP4 or WebM, up to 500 MB." />
        </Card>
      )}

      {tab === 'features' && (
        <Card pad className="stack">
          <h3>Features</h3>
          <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0 }}>
            <FeaturePicker value={draft.featureIds} onChange={(ids) => set('featureIds', ids)} />
          </fieldset>
          <p className="muted small">The catalogue is managed under <Link to="/types?tab=features">Residence types → Features</Link>.</p>
        </Card>
      )}

      {tab === 'rooms' && (
        <Card pad>
          <RoomsTab u={u} refetch={refetch} />
        </Card>
      )}
      {tab === 'people' && <PeopleTab u={u} refetch={refetch} />}
      {tab === 'enquiries' && (
        <Card>
          <CardHead title="Enquiries about this residence" icon={<Inbox size={18} />} />
          {u.enquiries.length === 0 ? (
            <Empty title="No enquiries yet" />
          ) : (
            <div className="table-wrap" style={{ padding: '0 14px 14px' }}>
              <table className="table">
                <thead><tr><th>Name</th><th>Email</th><th>Intent</th><th>Status</th><th>Received</th></tr></thead>
                <tbody>
                  {u.enquiries.map((e) => (
                    <tr key={e.id} data-clickable="true" onClick={() => navigate(`/enquiries?open=${e.id}`)}>
                      <td className="cell-strong">{e.name}</td>
                      <td className="muted">{e.email}</td>
                      <td>{humanise(e.intent)}</td>
                      <td><Badge tone={ENQUIRY_TONE[e.status]}>{humanise(e.status)}</Badge></td>
                      <td className="muted">{date(e.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      {tab === 'activity' && <ActivityTab u={u} />}
      {tab === 'preview' && <PreviewTab u={u} />}

      {tab !== 'preview' && tab !== 'activity' && (
        <p className="muted small" style={{ margin: 0 }}>
          Status {STATUS_LABEL[u.status].toLowerCase()} · <span className={`tone-${STATUS_TONE[u.status]}`} style={{ background: 'none' }}>●</span> changes you save here reach the website within seconds.
        </p>
      )}
    </>
  );
}
