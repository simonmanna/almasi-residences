import { useMemo } from 'react';
import { BarChart3, CircleDollarSign, Inbox, PieChart, Tag, TrendingUp } from 'lucide-react';
import { ENQUIRY_STATUSES, humanise, STATUS_LABEL, UNIT_STATUSES, VISIBLE_UNIT_STATUSES, type UnitStatus } from '@avida/types';
import { get } from '../lib/api';
import { money, STATUS_TONE } from '../lib/format';
import { useQuery } from '../lib/query';
import { floorName } from '../lib/ref';
import type { Dashboard } from '../lib/types';
import { Donut, StackBars } from '../components/Charts';
import { Card, CardHead, ErrorBox, LoadingPage, PageHead, Stat } from '../components/ui';

interface Intelligence {
  stages: Record<string, number>;
  agents: { id: string; name: string; leads: number; viewings: number; reservations: number; sales: number }[];
  demand: { id: string; code: string; type: string; pricePerSqmMinor: number; enquiries: number; interests: number; views: number; conversions: number; conversionRate: number }[];
  attentionGaps: { id: string; code: string; views: number; conversions: number; conversionRate: number }[];
  agedInventory: { id: string; code: string; type: string; priceMinor: number; availableSince: string }[];
}

const COLOR: Record<string, string> = { green: 'var(--green)', blue: 'var(--blue)', orange: 'var(--orange)', red: 'var(--red)', purple: 'var(--purple)', grey: 'var(--grey)' };

/** §3 / §50 — what is sold, what is held, what is left, and in which part of the building. */
export default function SalesOverview() {
  const { data: d, error, refetch } = useQuery('dashboard', () => get<Dashboard>('/admin/dashboard'));
  const { data: intelligence, error: intelligenceError, refetch: refetchIntelligence } = useQuery('sales:intelligence', () => get<Intelligence>('/admin/sales-desk/intelligence'));

  const byGroup = useMemo(() => {
    if (!d) return [];
    const groups = new Map<string, Record<UnitStatus, number>>();
    for (const f of d.building) {
      for (const u of f.units) {
        const key = u.typology.isPenthouse ? 'Penthouses' : `${u.bedrooms} bedroom${u.bedrooms === 1 ? '' : 's'}`;
        const g = groups.get(key) ?? (Object.fromEntries(UNIT_STATUSES.map((s) => [s, 0])) as Record<UnitStatus, number>);
        g[u.status] += u.effectivePriceMinor;
        groups.set(key, g);
      }
    }
    return [...groups.entries()].map(([label, v]) => ({ label, parts: VISIBLE_UNIT_STATUSES.map((s) => ({ label: STATUS_LABEL[s], value: v[s], color: COLOR[STATUS_TONE[s]]! })) }));
  }, [d]);

  const byFloor = useMemo(
    () =>
      (d?.building ?? [])
        .filter((f) => f.units.length)
        .map((f) => ({ label: floorName(f), parts: VISIBLE_UNIT_STATUSES.map((s) => ({ label: STATUS_LABEL[s], value: f.stats[s], color: COLOR[STATUS_TONE[s]]! })) })),
    [d],
  );

  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!d) return <LoadingPage />;
  const c = d.currency;
  const slices = (key: 'count' | 'value') =>
    VISIBLE_UNIT_STATUSES.map((s) => ({ label: STATUS_LABEL[s], value: key === 'count' ? d.stats.byStatus[s] : d.sales.valueByStatus[s], color: COLOR[STATUS_TONE[s]]! })).filter((x) => x.value > 0);

  return (
    <>
      <PageHead title="Sales overview" sub="Every figure is counted from the residence records as you open this page." />
      <div className="grid-3">
        <Stat label="Total property value" value={money(d.sales.totalValueMinor, c)} icon={<CircleDollarSign size={20} />} tone="indigo" />
        <Stat label="Sold value" value={money(d.sales.soldValueMinor, c)} sub={`${d.sales.percentSold}% of residences sold`} icon={<TrendingUp size={20} />} tone="red" />
        <Stat label="Reserved / on hold" value={money(d.sales.reservedValueMinor, c)} icon={<PieChart size={20} />} tone="blue" />
        <Stat label="Available to sell" value={money(d.sales.availableValueMinor, c)} sub={`${d.stats.byStatus.AVAILABLE} residences`} icon={<Tag size={20} />} tone="green" />
        <Stat label="Average residence price" value={money(d.sales.averagePriceMinor, c)} icon={<BarChart3 size={20} />} tone="sky" />
        <Stat label="Average price per m²" value={money(d.sales.averagePricePerSqmMinor, c)} icon={<BarChart3 size={20} />} tone="teal" />
      </div>

      <div className="grid-2">
        <Card>
          <CardHead title="Residences by status" icon={<PieChart size={18} />} />
          <div className="card-body donut-wrap">
            <Donut slices={slices('count')} size={170} centre={<div><strong style={{ fontSize: 26, fontFamily: 'var(--display)' }}>{d.stats.residences}</strong><div className="muted small">residences</div></div>} />
            <div className="stack-sm" style={{ flex: 1 }}>
              {VISIBLE_UNIT_STATUSES.map((s) => (
                <div key={s} className="row small">
                  <i style={{ width: 10, height: 10, borderRadius: '50%', background: COLOR[STATUS_TONE[s]] }} />
                  <span style={{ flex: 1 }}>{STATUS_LABEL[s]}</span>
                  <strong className="tabular">{d.stats.byStatus[s]}</strong>
                  <span className="muted tabular" style={{ width: 70, textAlign: 'right' }}>{money(d.sales.valueByStatus[s], c, { compact: true })}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Card>
          <CardHead title="Value by status" icon={<CircleDollarSign size={18} />} />
          <div className="card-body donut-wrap">
            <Donut slices={slices('value')} size={170} centre={<div><strong style={{ fontSize: 17, fontFamily: 'var(--display)' }}>{money(d.sales.totalValueMinor, c, { compact: true })}</strong><div className="muted small">total</div></div>} />
            <div className="stack-sm" style={{ flex: 1 }}>
              {d.breakdown.map((b) => (
                <div key={b.key} className="row small">
                  <span style={{ flex: 1 }}>{b.label}</span>
                  <span className="muted">{b.available} of {b.count} available</span>
                  <strong className="tabular" style={{ width: 90, textAlign: 'right' }}>{b.priceFromMinor ? `from ${money(b.priceFromMinor, c, { compact: true })}` : '—'}</strong>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid-2">
        <Card>
          <CardHead title="Value by residence type" sub="Each bar split by status." />
          <div className="card-body"><StackBars rows={byGroup} format={(n) => money(n, c, { compact: true })} /></div>
        </Card>
        <Card>
          <CardHead title="Floor by floor" sub="Residences per status." />
          <div className="card-body"><StackBars rows={byFloor} /></div>
        </Card>
      </div>

      <Card>
        <CardHead title="Enquiry pipeline" icon={<Inbox size={18} />} sub={`${d.stats.enquiries.total} enquiries · ${d.stats.enquiries.open} open · ${d.stats.enquiries.thisWeek} this week`} />
        <div className="card-body">
          <StackBars rows={ENQUIRY_STATUSES.filter((s) => s !== 'SPAM').map((s) => ({ label: humanise(s), parts: [{ label: humanise(s), value: d.stats.enquiries.byStatus[s] ?? 0, color: 'var(--sky-500)' }] }))} />
        </div>
      </Card>

      {intelligenceError && <ErrorBox error={intelligenceError} onRetry={refetchIntelligence} />}
      {intelligence && (
        <>
          <div className="grid-2">
            <Card>
              <CardHead title="Lead conversion by stage" sub="Share of all qualified enquiries currently at each stage." />
              <div className="table-wrap"><table className="table"><thead><tr><th>Stage</th><th className="num">Leads</th><th className="num">Share</th></tr></thead><tbody>{ENQUIRY_STATUSES.filter((status) => status !== 'SPAM').map((status) => { const count = intelligence.stages[status] ?? 0; const total = Object.entries(intelligence.stages).filter(([key]) => key !== 'SPAM').reduce((sum, [, value]) => sum + value, 0); return <tr key={status}><td className="cell-strong">{humanise(status)}</td><td className="num">{count}</td><td className="num">{total ? Math.round((count / total) * 100) : 0}%</td></tr>; })}</tbody></table></div>
            </Card>
            <Card>
              <CardHead title="Demand by residence" sub="Enquiries and saved buyer interests, ranked together." />
              <div className="table-wrap"><table className="table"><thead><tr><th>Residence</th><th>Type</th><th className="num">Price / m²</th><th className="num">Views</th><th className="num">Leads</th><th className="num">Interests</th></tr></thead><tbody>{intelligence.demand.slice(0, 10).map((r) => <tr key={r.id}><td className="cell-strong">{r.code}</td><td>{r.type}</td><td className="num">{money(r.pricePerSqmMinor, c)}</td><td className="num">{r.views}</td><td className="num">{r.enquiries}</td><td className="num">{r.interests}</td></tr>)}</tbody></table></div>
            </Card>
          </div>
          <div className="grid-2">
            <Card>
              <CardHead title="Attention without conversion" sub="Frequently viewed residences with the weakest action rate." />
              <div className="table-wrap"><table className="table"><thead><tr><th>Residence</th><th className="num">Views</th><th className="num">Actions</th><th className="num">Rate</th></tr></thead><tbody>{intelligence.attentionGaps.map((r) => <tr key={r.id}><td className="cell-strong">{r.code}</td><td className="num">{r.views}</td><td className="num">{r.conversions}</td><td className="num">{r.conversionRate}%</td></tr>)}</tbody></table></div>
            </Card>
          </div>
          <div className="grid-2">
            <Card>
              <CardHead title="Agent attribution" sub="Owned leads and the stages each agent has advanced." />
              <div className="table-wrap"><table className="table"><thead><tr><th>Agent</th><th className="num">Leads</th><th className="num">Viewings</th><th className="num">Reservations</th><th className="num">Sales</th></tr></thead><tbody>{intelligence.agents.map((a) => <tr key={a.id}><td className="cell-strong">{a.name}</td><td className="num">{a.leads}</td><td className="num">{a.viewings}</td><td className="num">{a.reservations}</td><td className="num">{a.sales}</td></tr>)}</tbody></table></div>
            </Card>
            <Card>
              <CardHead title="Aged available inventory" sub="Longest continuously available residences first." />
              <div className="table-wrap"><table className="table"><thead><tr><th>Residence</th><th>Type</th><th>Available since</th><th className="num">Price</th></tr></thead><tbody>{intelligence.agedInventory.map((r) => <tr key={r.id}><td className="cell-strong">{r.code}</td><td>{r.type}</td><td>{new Date(r.availableSince).toLocaleDateString()}</td><td className="num">{money(r.priceMinor, c)}</td></tr>)}</tbody></table></div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
