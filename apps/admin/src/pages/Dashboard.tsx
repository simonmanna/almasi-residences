import { useMemo, useState, type ReactElement } from 'react';
import {
  Activity,
  ArrowRight,
  Bath,
  BedDouble,
  Building,
  Building2,
  Car,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Crown,
  Eye,
  Images,
  Inbox,
  Layers,
  MapPin,
  Maximize2,
  PieChart,
  Plus,
  Sparkles,
  Tag,
  Users,
} from 'lucide-react';
import { STATUS_LABEL, type UnitStatus } from '@avida/types';
import { get, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago, area, code as fmtCode, date, money, STATUS_TONE } from '../lib/format';
import { useQuery } from '../lib/query';
import { Link, navigate } from '../lib/router';
import type { BuildingFloor, Dashboard as DashboardData, Paged, ResidenceRow } from '../lib/types';
import { BuildingMap, StatusLegend } from '../components/BuildingMap';
import { Donut } from '../components/Charts';
import { InlinePrice } from '../components/InlinePrice';
import { StatusSelect } from '../components/StatusSelect';
import { UnitQuickView } from '../components/UnitQuickView';
import { WebsiteSync } from '../components/WebsiteSync';
import { Badge, Card, CardHead, Empty, ErrorBox, LoadingPage, MediaImg, Select, Stat } from '../components/ui';

const TONE_COLOR: Record<string, string> = { green: 'var(--green)', blue: 'var(--blue)', orange: 'var(--orange)', red: 'var(--red)', purple: 'var(--purple)', grey: 'var(--grey)' };

const ACTIVITY_ICON: Record<string, [ReactElement, string]> = {
  residence: [<Building2 size={17} />, 'green'],
  media: [<Images size={17} />, 'purple'],
  resident: [<Users size={17} />, 'teal'],
  buyer: [<Users size={17} />, 'blue'],
  enquiry: [<Inbox size={17} />, 'sky'],
  floor: [<Layers size={17} />, 'indigo'],
  'payment-plan': [<CircleDollarSign size={17} />, 'orange'],
};

function ResidencesPreview() {
  const [floorId, setFloorId] = useState('');
  const [typologyId, setTypologyId] = useState('');
  const [status, setStatus] = useState('');
  const { data: floors } = useQuery('floors', () => get<{ id: string; label: string; displayName: string | null }[]>('/admin/floors'));
  const { data: types } = useQuery('types', () => get<{ id: string; name: string }[]>('/admin/types'));
  const { data, error } = useQuery(`residences:dash:${floorId}:${typologyId}:${status}`, () =>
    get<Paged<ResidenceRow>>(`/admin/residences${qs({ floorId, typologyId, status, pageSize: 7 })}`),
  );
  const { can } = useAuth();
  return (
    <Card>
      <CardHead title="All residences" icon={<Building2 size={19} />}>
        <Select className="sm" value={floorId} onChange={(e) => setFloorId(e.target.value)} placeholder="All floors" options={(floors ?? []).map((f) => ({ value: f.id, label: f.displayName ?? f.label }))} />
        <Select className="sm" value={typologyId} onChange={(e) => setTypologyId(e.target.value)} placeholder="All types" options={(types ?? []).map((t) => ({ value: t.id, label: t.name }))} />
        <Select className="sm" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All statuses" options={Object.entries(STATUS_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
        {can('residence.edit') && (
          <Link to="/residences/new" className="btn primary sm">
            <Plus size={15} /> Add residence
          </Link>
        )}
      </CardHead>
      {error && <div className="card-body"><ErrorBox error={error} /></div>}
      <div className="table-wrap" style={{ padding: '0 14px' }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 56 }} />
              <th>Unit code</th>
              <th>Floor</th>
              <th>Type</th>
              <th className="num">Bedrooms</th>
              <th className="num">Size</th>
              <th className="num">Price</th>
              <th>Status</th>
              <th className="actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(data?.data ?? []).map((r) => (
              <tr key={r.id} data-clickable="true" onClick={() => navigate(`/residences/${r.id}`)}>
                <td>{r.cover ? <MediaImg m={r.cover} thumb className="thumb" sizes="60px" /> : <span className="thumb-empty"><Building2 size={15} /></span>}</td>
                <td className="cell-strong">{fmtCode(r.code)}</td>
                <td className="muted">{r.floor.displayName ?? r.floor.label}</td>
                <td>{r.typology.name}</td>
                <td className="num">{r.bedrooms}</td>
                <td className="num">{area(r.areaSqm)}</td>
                <td className="num"><InlinePrice id={r.id} code={r.code} priceMinor={r.priceMinor} currency={r.currency} effectiveMinor={r.effectivePriceMinor} /></td>
                <td><StatusSelect id={r.id} code={r.code} status={r.status} /></td>
                <td className="actions">
                  <Link to={`/residences/${r.id}`} className="btn xs" onClick={(e) => e.stopPropagation()}>View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        Showing {data?.data.length ?? 0} of {data?.meta.total ?? 0} residences
        <Link to={`/residences${qs({ floorId, typologyId, status })}`} style={{ marginLeft: 'auto' }} className="row">
          Open the full table <ArrowRight size={14} />
        </Link>
      </div>
    </Card>
  );
}

/** §3 — a floor drawn as a plan, the way the mockup's "Floor overview" reads. */
function FloorOverview({ floors, onOpen }: { floors: BuildingFloor[]; onOpen: (id: string) => void }) {
  const residential = floors.filter((f) => f.units.length > 0);
  const [floorId, setFloorId] = useState(residential.find((f) => f.level === 2)?.id ?? residential[0]?.id ?? '');
  const floor = residential.find((f) => f.id === floorId);
  if (!floor) return null;
  const half = Math.ceil(floor.units.length / 2);
  const rows = [floor.units.slice(0, half), floor.units.slice(half)].filter((r) => r.length);
  const cls = (u: BuildingFloor['units'][number]) => (u.typology.isPenthouse || u.bedrooms >= 3 ? 'b3' : u.bedrooms === 2 ? 'b2' : 'b1');
  return (
    <Card>
      <CardHead title="Floor overview" icon={<Layers size={18} />}>
        <Select className="sm" value={floorId} onChange={(e) => setFloorId(e.target.value)} options={residential.map((f) => ({ value: f.id, label: f.displayName ?? f.label }))} />
      </CardHead>
      <div className="card-body stack-sm">
        <div className="plan">
          {rows.map((row, i) => (
            <div key={i} className="plan-row">
              {row.map((u) => (
                <button key={u.id} type="button" className={`plan-cell ${cls(u)}`} onClick={() => onOpen(u.id)} title={`${fmtCode(u.code)} — ${STATUS_LABEL[u.status]}`}>
                  <strong>{fmtCode(u.code)}</strong>
                  {u.typology.isPenthouse ? 'PH' : `${u.bedrooms}BR`}
                  <br />
                  {Math.round(u.areaSqm)} sqm
                  <br />
                  <span style={{ color: TONE_COLOR[STATUS_TONE[u.status]], fontWeight: 600 }}>{STATUS_LABEL[u.status]}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="legend">
          <span><i style={{ background: '#bfe8d4' }} /> 1 bedroom</span>
          <span><i style={{ background: '#fbdcb0' }} /> 2 bedrooms</span>
          <span><i style={{ background: '#d9ccf8' }} /> 3 bedrooms / penthouse</span>
        </div>
      </div>
    </Card>
  );
}

function FeaturedResidence({ items }: { items: DashboardData['featured'] }) {
  const [i, setI] = useState(0);
  const [photo, setPhoto] = useState(0);
  const f = items[i];
  if (!f) {
    return (
      <Card>
        <CardHead title="Featured residence" icon={<Crown size={18} />} />
        <Empty title="No featured residence">Mark a residence as featured and it appears here and on the homepage.</Empty>
      </Card>
    );
  }
  const img = f.images[photo % Math.max(1, f.images.length)];
  return (
    <Card>
      <CardHead title="Featured residence" icon={<Crown size={18} />}>
        {items.length > 1 && (
          <span className="muted small">
            {i + 1} / {items.length}
            <button type="button" className="btn xs" style={{ marginLeft: 8 }} onClick={() => { setI((i + 1) % items.length); setPhoto(0); }}>Next</button>
          </span>
        )}
      </CardHead>
      <div className="card-body stack-sm">
        <div className="featured-photo">
          {img ? <MediaImg m={img} sizes="420px" /> : <Empty title="No photographs yet" />}
          {f.images.length > 1 && (
            <div className="nav">
              <button type="button" aria-label="Previous photograph" onClick={() => setPhoto((p) => (p - 1 + f.images.length) % f.images.length)}><ChevronLeft size={16} /></button>
              <button type="button" aria-label="Next photograph" onClick={() => setPhoto((p) => (p + 1) % f.images.length)}><ChevronRight size={16} /></button>
              <span>{(photo % f.images.length) + 1} / {f.images.length}</span>
            </div>
          )}
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <strong style={{ fontFamily: 'var(--display)', color: 'var(--navy)' }}>{fmtCode(f.code)} — {f.floor}</strong>
            <div className="muted small">{f.type} · {area(f.areaSqm)} · {money(f.priceMinor, f.currency)}</div>
          </div>
          <Badge tone={STATUS_TONE[f.status]}>{STATUS_LABEL[f.status]}</Badge>
        </div>
        <div className="row-wrap small muted" style={{ gap: 16 }}>
          <span className="row" style={{ gap: 5 }}><BedDouble size={15} /> {f.bedrooms} bed</span>
          <span className="row" style={{ gap: 5 }}><Bath size={15} /> {f.bathrooms} bath</span>
          {f.hasBalcony && <span className="row" style={{ gap: 5 }}><Maximize2 size={15} /> Balcony</span>}
          <span className="row" style={{ gap: 5 }}><Car size={15} /> {f.parkingIncluded} parking</span>
        </div>
        <Link to={`/residences/${f.id}`} className="btn primary sm" style={{ justifySelf: 'start' }}>View details</Link>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { data: d, error, refetch } = useQuery('dashboard', () => get<DashboardData>('/admin/dashboard'));
  const [open, setOpen] = useState<string | null>(null);
  const { can } = useAuth();

  const donut = useMemo(
    () =>
      d
        ? (Object.keys(d.stats.byStatus) as UnitStatus[]).filter((s) => d.stats.byStatus[s] > 0).map((s) => ({ label: STATUS_LABEL[s], value: d.stats.byStatus[s], color: TONE_COLOR[STATUS_TONE[s]]! }))
        : [],
    [d],
  );

  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!d) return <LoadingPage />;
  const c = d.currency;
  const total = d.stats.residences || 1;
  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;
  const bedIcons = [<BedDouble size={22} />, <BedDouble size={22} />, <Crown size={22} />];
  const bedTones = ['purple', 'blue', 'orange'];

  return (
    <>
      <WebsiteSync />
      <section className="hero">
        {d.property.heroImage && <MediaImg m={d.property.heroImage} sizes="1400px" />}
        <div className="hero-body">
          <div className="hero-kicker">{d.property.name}</div>
          <h2>
            Premium apartments
            <br />
            in Kimihurura
          </h2>
          <div className="hero-loc">
            <MapPin size={18} /> {d.property.location}
          </div>
        </div>
        <div className="hero-script" aria-hidden="true">
          Luxury Living
          <br />
          &nbsp;&nbsp;&nbsp;Redefined
        </div>
        <div className="hero-meta">
          <span>Building<strong>{d.property.buildingConfig ?? '—'}</strong></span>
          <span>Planned handover<strong>{date(d.property.handoverDate)}</strong></span>
          <span>Construction<strong>{d.property.constructionStatus.toLowerCase().replace(/_/g, ' ')}{d.property.constructionPercent !== null ? ` · ${d.property.constructionPercent}%` : ''}</strong></span>
          <span>Sold<strong>{d.sales.percentSold}%</strong></span>
        </div>
      </section>

      <div className="dash-grid">
        <div className="stack" style={{ gap: 24, minWidth: 0 }}>
          <div className="grid-4">
            <Stat label="Total residences" value={d.stats.residences} sub={`${d.stats.residentialFloors} residential floors`} icon={<Building size={22} />} tone="sky" to="/residences" />
            {d.breakdown.slice(0, 3).map((b, i) => (
              <Stat
                key={b.key}
                label={b.label}
                value={b.count}
                sub={b.areaMin === b.areaMax ? area(b.areaMin) : `${Math.round(b.areaMin)} – ${Math.round(b.areaMax)} sqm`}
                icon={bedIcons[i] ?? <BedDouble size={22} />}
                tone={bedTones[i] ?? 'sky'}
                to={b.key === 'penthouse' ? '/residences?q=PH' : `/residences?bedrooms=${b.key.split('-')[0]}`}
              />
            ))}
          </div>

          <div className="grid-3">
            <Stat label="Total property value" value={money(d.sales.totalValueMinor, c, { compact: true })} sub={`Average ${money(d.sales.averagePriceMinor, c, { compact: true })}`} icon={<CircleDollarSign size={22} />} tone="indigo" to="/sales" />
            <Stat label="Available to sell" value={money(d.sales.availableValueMinor, c, { compact: true })} sub={`${d.stats.byStatus.AVAILABLE} residences`} icon={<Tag size={22} />} tone="green" to="/residences?status=AVAILABLE" />
            <Stat label="Sold · reserved" value={`${money(d.sales.soldValueMinor, c, { compact: true })} · ${money(d.sales.reservedValueMinor, c, { compact: true })}`} sub={`Average ${money(d.sales.averagePricePerSqmMinor, c)} per m²`} icon={<PieChart size={22} />} tone="orange" to="/sales" />
          </div>

          <ResidencesPreview />
        </div>

        <div className="stack" style={{ gap: 24, minWidth: 0 }}>
          <Card>
            <CardHead title="Quick stats" icon={<Activity size={18} />} />
            <div className="card-body stack-sm">
              <div className="donut-wrap" style={{ justifyContent: 'center', padding: '4px 0 10px' }}>
                <Donut slices={donut} size={132} thickness={16} centre={<div><div style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 24, color: 'var(--navy)' }}>{d.stats.residences}</div><div className="muted small">residences</div></div>} />
              </div>
              {(['AVAILABLE', 'RESERVED', 'BOOKED', 'SOLD'] as UnitStatus[]).map((s) => (
                <Link key={s} to={`/residences?status=${s}`} className="row" style={{ padding: '8px 4px', color: 'var(--ink)', borderTop: '1px solid var(--line-2)' }}>
                  <span className={`stat-icon tone-${STATUS_TONE[s]}`} style={{ width: 34, height: 34, borderRadius: 10 }}><Building2 size={16} /></span>
                  <span style={{ flex: 1 }}>
                    <span className="small muted">{STATUS_LABEL[s]} units</span>
                    <strong style={{ display: 'block', fontSize: 18, fontFamily: 'var(--display)' }} className="tabular">{d.stats.byStatus[s]}</strong>
                  </span>
                  <span className="muted small tabular">{pct(d.stats.byStatus[s])}</span>
                </Link>
              ))}
            </div>
          </Card>

          <Card>
            <CardHead title="Recent activities" icon={<Activity size={18} />}>{can('audit.view') && <Link to="/audit" className="small">View all</Link>}</CardHead>
            <div className="card-body activity">
              {d.activity.length === 0 && <p className="muted small">Changes made in the admin appear here.</p>}
              {d.activity.slice(0, 7).map((a) => {
                const [icon, tone] = ACTIVITY_ICON[a.entity ?? ''] ?? [<Sparkles size={17} />, 'sky'];
                return (
                  <div key={a.id} className="activity-item">
                    <span className={`activity-icon tone-${tone}`}>{icon}</span>
                    <div>
                      <strong>{a.summary ?? a.action}</strong>
                      <p>{a.actorName}</p>
                      <time>{ago(a.createdAt)}</time>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="grid-2" style={{ gap: 14 }}>
            <Stat label="Residents" value={d.stats.residents.active} sub={`${d.stats.residents.total} on record`} icon={<Users size={20} />} tone="teal" to={can('resident.view') ? '/residents' : undefined} />
            <Stat label="New enquiries" value={d.stats.enquiries.new} sub={`${d.stats.enquiries.thisWeek} this week`} icon={<Inbox size={20} />} tone="sky" to={can('enquiry.view') ? '/enquiries?status=NEW' : undefined} />
            <Stat label="Parking" value={d.stats.parking.total} sub={`${d.stats.parking.byStatus.AVAILABLE ?? 0} available`} icon={<Car size={20} />} tone="grey" to="/parking" />
            <Stat label="Amenities" value={d.stats.amenities} sub={`${d.stats.floors} floors`} icon={<Sparkles size={20} />} tone="gold" to="/amenities" />
          </div>
        </div>
      </div>

      <Card>
        <CardHead title="The building" icon={<Building size={19} />} sub="Every residence, floor by floor. Click one to see it and change its status or price.">
          <StatusLegend counts={d.stats.byStatus} />
          <Link to="/availability" className="btn sm"><Eye size={15} /> Availability map</Link>
        </CardHead>
        <div className="card-body">
          <BuildingMap floors={d.building} onSelect={(u) => setOpen(u.id)} selectedId={open} />
        </div>
      </Card>

      <div className="grid-3" style={{ alignItems: 'start' }}>
        <FloorOverview floors={d.building} onOpen={setOpen} />
        <FeaturedResidence items={d.featured} />
        <Card>
          <CardHead title="Recent images" icon={<Images size={18} />}>
            <Link to="/media" className="small">View all</Link>
          </CardHead>
          <div className="card-body">
            {d.recentImages.length ? (
              <div className="mosaic">
                {d.recentImages.slice(0, 7).map((m) => (
                  <Link key={m.id} to={`/media?open=${m.id}`} className="media-tile">
                    <MediaImg m={m} thumb sizes="200px" />
                  </Link>
                ))}
              </div>
            ) : (
              <Empty title="No images yet" />
            )}
          </div>
        </Card>
      </div>

      {open && <UnitQuickView id={open} onClose={() => setOpen(null)} />}
    </>
  );
}
