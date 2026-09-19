import { BarChart3, Clock, Target, TrendingDown, Users } from 'lucide-react';
import { LEAD_SOURCE_LABEL, LOST_REASON_LABEL, STAGE_LABEL, type LeadSourceValue, type LostReasonValue } from '@avida/types';
import { get, qs } from '../lib/api';
import { money } from '../lib/format';
import { useQuery } from '../lib/query';
import { useTeam, useTypes } from '../lib/ref';
import { Link, useSearchState } from '../lib/router';
import { Meter } from '../components/crm';
import { Card, CardHead, ErrorBox, Input, PageHead, Select, Skeleton } from '../components/ui';

interface Group { key: string; label: string; leads: number; contacted: number; qualified: number; viewings: number; won: number; lost: number; valueMinor: number; conversion: number; medianResponseHours?: number | null; budgetMinor?: number | null }
interface Report {
  range: { from: string; to: string };
  currency: string;
  totals: { leads: number; contacted: number; qualified: number; viewings: number; reserved: number; won: number; lost: number; wonValueMinor: number };
  conversion: { leadToViewing: number; viewingToCompleted: number; viewingToReserved: number; reservationToSale: number; leadToSale: number };
  funnel: { status: string; count: number }[];
  bySource: Group[];
  byAgent: Group[];
  byType: Group[];
  byCampaign: Group[];
  byResidence: { key: string; label: string; leads: number; won: number }[];
  byStage: { label: string; color: string; category: string; count: number; valueMinor: number }[];
  lostReasons: { reason: string; count: number }[];
  timeInStage: { status: string; avgHours: number | null; medianHours: number | null; samples: number }[];
  responseTime: { avgHours: number | null; medianHours: number | null; withinTarget: number; targetHours: number; neverContacted: number };
  followUps: { due: number; onTime: number; late: number; missed: number; onTimeRate: number };
  trend: { week: string; leads: number; won: number }[];
}

const hours = (h: number | null) => (h === null ? '—' : h < 48 ? `${h} h` : `${Math.round(h / 24)} d`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

function GroupTable({ rows, cur, first, extra }: { rows: Group[]; cur: string; first: string; extra?: { label: string; value: (g: Group) => React.ReactNode } }) {
  const max = Math.max(1, ...rows.map((r) => r.leads));
  return (
    <div className="table-wrap">
      <table className="table report-table">
        <thead><tr><th>{first}</th><th>Leads</th><th className="num">Qualified</th><th className="num">Viewings</th><th className="num">Sold</th><th className="num">Conv.</th><th className="num">Sold value</th>{extra && <th className="num">{extra.label}</th>}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.label}</td>
              <td><span className="row" style={{ gap: 8 }}><Meter value={r.leads} max={max} /><strong className="tabular">{r.leads}</strong></span></td>
              <td className="num">{r.qualified}</td>
              <td className="num">{r.viewings}</td>
              <td className="num"><strong>{r.won}</strong></td>
              <td className="num">{r.conversion}%</td>
              <td className="num">{r.valueMinor ? money(r.valueMinor, cur, { compact: true }) : '—'}</td>
              {extra && <td className="num">{extra.value(r)}</td>}
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={8} className="muted small">No data in this range.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/** Management reports: which sources sell, where leads stall, how quickly the team answers. */
export default function CrmReports() {
  const { data: team } = useTeam();
  const { data: types } = useTypes();
  const [s, set] = useSearchState();
  const from = s.from ?? iso(new Date(Date.now() - 90 * 86_400_000));
  const to = s.to ?? iso(new Date());
  const query = qs({ from, to, agentId: s.agentId, typologyId: s.typologyId, source: s.source });
  const { data, error, refetch } = useQuery(`crm:reports:${query}`, () => get<Report>(`/admin/crm/reports${query}`));
  const cur = data?.currency ?? 'USD';
  const trendMax = Math.max(1, ...(data?.trend.map((t) => t.leads) ?? [1]));
  const funnelMax = Math.max(1, ...(data?.funnel.map((f) => f.count) ?? [1]));
  const lostMax = Math.max(1, ...(data?.lostReasons.map((l) => l.count) ?? [1]));
  const dwellMax = Math.max(1, ...(data?.timeInStage.map((t) => t.avgHours ?? 0) ?? [1]));

  return (
    <>
      <PageHead title="CRM reports" sub={data ? `Leads created ${from} → ${to}` : 'Sources, conversion, speed and pipeline health'} />
      <div className="board-toolbar report-filters">
        <label className="small">From <Input type="date" className="sm" value={from} onChange={(e) => set({ from: e.target.value })} /></label>
        <label className="small">To <Input type="date" className="sm" value={to} onChange={(e) => set({ to: e.target.value })} /></label>
        <Select className="sm" value={s.agentId ?? ''} onChange={(e) => set({ agentId: e.target.value })} placeholder="All salespeople" options={(team ?? []).map((t) => ({ value: t.id, label: t.name }))} />
        <Select className="sm" value={s.typologyId ?? ''} onChange={(e) => set({ typologyId: e.target.value })} placeholder="All residence types" options={(types ?? []).map((t) => ({ value: t.id, label: t.name }))} />
        <Select className="sm" value={s.source ?? ''} onChange={(e) => set({ source: e.target.value })} placeholder="All sources" options={Object.entries(LEAD_SOURCE_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
        <div className="row-wrap" style={{ gap: 4 }}>
          {[30, 90, 180, 365].map((d) => <button key={d} type="button" className="btn xs" onClick={() => set({ from: iso(new Date(Date.now() - d * 86_400_000)), to: null })}>{d === 365 ? '1 year' : `${d} days`}</button>)}
        </div>
      </div>
      {error && <ErrorBox error={error} onRetry={refetch} />}
      {!data && !error && <Skeleton h={400} />}
      {data && (
        <div className="stack">
          <div className="kpi-grid">
            <div className="kpi"><span className="kpi-label">Leads</span><div className="kpi-value tabular">{data.totals.leads}</div><div className="kpi-sub">{data.totals.contacted} contacted</div></div>
            <div className="kpi"><span className="kpi-label">Lead → viewing</span><div className="kpi-value tabular">{data.conversion.leadToViewing}%</div><div className="kpi-sub">{data.totals.viewings} with a viewing</div></div>
            <div className="kpi"><span className="kpi-label">Viewing → reserved</span><div className="kpi-value tabular">{data.conversion.viewingToReserved}%</div><div className="kpi-sub">{data.totals.reserved} reached reservation</div></div>
            <div className="kpi"><span className="kpi-label">Lead → sale</span><div className="kpi-value tabular">{data.conversion.leadToSale}%</div><div className="kpi-sub">{data.totals.won} sold · {money(data.totals.wonValueMinor, cur, { compact: true })}</div></div>
            <div className="kpi"><span className="kpi-label">Reservation → sale</span><div className="kpi-value tabular">{data.conversion.reservationToSale}%</div><div className="kpi-sub">Closed holds that converted</div></div>
            <div className="kpi"><span className="kpi-label">Median first reply</span><div className={`kpi-value tabular ${data.responseTime.medianHours !== null && data.responseTime.medianHours > data.responseTime.targetHours ? 'is-alert' : ''}`}>{hours(data.responseTime.medianHours)}</div><div className="kpi-sub">{data.responseTime.withinTarget}% within {data.responseTime.targetHours} h</div></div>
            <div className="kpi"><span className="kpi-label">Follow-ups on time</span><div className="kpi-value tabular">{data.followUps.onTimeRate}%</div><div className="kpi-sub">{data.followUps.late} late · {data.followUps.missed} missed</div></div>
            <div className="kpi"><span className="kpi-label">Lost</span><div className="kpi-value tabular">{data.totals.lost}</div><div className="kpi-sub">{data.lostReasons[0] ? `Top reason: ${LOST_REASON_LABEL[data.lostReasons[0].reason as LostReasonValue] ?? data.lostReasons[0].reason}` : 'None'}</div></div>
          </div>

          <div className="grid-2 report-grid">
            <Card>
              <CardHead title="Conversion funnel" icon={<Target size={18} />} sub="How far leads from this period got" />
              <div className="card-body funnel">
                {data.funnel.map((f, i) => (
                  <div key={f.status} className="funnel-step">
                    <span>{i === 0 ? 'Leads' : STAGE_LABEL[f.status]}</span>
                    <span className="funnel-bar"><i style={{ width: `${Math.max(f.count ? 3 : 0, (f.count / funnelMax) * 100)}%`, opacity: 1 - i * 0.08 }} /></span>
                    <strong className="tabular">{f.count}</strong>
                    <span className="muted small tabular">{i > 0 && data.funnel[0]!.count ? `${Math.round((f.count / data.funnel[0]!.count) * 100)}%` : ''}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <CardHead title="New leads per week" icon={<BarChart3 size={18} />} sub="Dark: leads that have since sold" />
              <div className="card-body">
                <div className="trend" role="img" aria-label="Leads per week">
                  {data.trend.map((t) => (
                    <div key={t.week} className="trend-col" title={`Week of ${t.week}: ${t.leads} leads, ${t.won} sold`}>
                      <span className="trend-bar" style={{ height: `${(t.leads / trendMax) * 100}%` }}><i style={{ height: `${t.leads ? (t.won / t.leads) * 100 : 0}%` }} /></span>
                      <small>{t.week.slice(5)}</small>
                    </div>
                  ))}
                  {data.trend.length === 0 && <p className="muted small">No leads in this range.</p>}
                </div>
              </div>
            </Card>
          </div>

          <Card>
            <CardHead title="Lead sources" icon={<BarChart3 size={18} />} sub="Which channels bring leads — and which bring buyers" />
            <GroupTable rows={data.bySource.map((r) => ({ ...r, label: LEAD_SOURCE_LABEL[r.key as LeadSourceValue] ?? r.label }))} cur={cur} first="Source" />
          </Card>

          <Card>
            <CardHead title="By salesperson" icon={<Users size={18} />} sub="Workload and outcomes — for coaching, not ranking" />
            <GroupTable rows={data.byAgent} cur={cur} first="Salesperson" extra={{ label: 'Median reply', value: (g) => hours(g.medianResponseHours ?? null) }} />
          </Card>

          <div className="grid-2 report-grid">
            <Card>
              <CardHead title="By residence type" />
              <GroupTable rows={data.byType} cur={cur} first="Type" />
            </Card>
            <Card>
              <CardHead title="Most-wanted residences" />
              <div className="card-body source-list">
                {data.byResidence.map((r) => (
                  <div key={r.key} className="source-row"><Link to={`/residences/${r.key}`}>{r.label}</Link><Meter value={r.leads} max={data.byResidence[0]?.leads ?? 1} tone="indigo" /><strong className="tabular">{r.leads}</strong></div>
                ))}
                {data.byResidence.length === 0 && <p className="muted small">No residence interest recorded.</p>}
              </div>
            </Card>
          </div>

          <div className="grid-2 report-grid">
            <Card>
              <CardHead title="Average time in stage" icon={<Clock size={18} />} sub="Where leads wait longest" />
              <div className="card-body source-list">
                {data.timeInStage.map((t) => (
                  <div key={t.status} className="source-row"><span>{STAGE_LABEL[t.status]}</span><Meter value={t.avgHours ?? 0} max={dwellMax} tone={(t.avgHours ?? 0) > 14 * 24 ? 'orange' : 'sky'} /><strong className="tabular">{hours(t.avgHours)}</strong></div>
                ))}
              </div>
            </Card>
            <Card>
              <CardHead title="Why leads are lost" icon={<TrendingDown size={18} />} />
              <div className="card-body source-list">
                {data.lostReasons.map((l) => (
                  <div key={l.reason} className="source-row"><span>{LOST_REASON_LABEL[l.reason as LostReasonValue] ?? 'Not recorded'}</span><Meter value={l.count} max={lostMax} tone="red" /><strong className="tabular">{l.count}</strong></div>
                ))}
                {data.lostReasons.length === 0 && <p className="muted small">No lost leads in this range.</p>}
              </div>
            </Card>
          </div>

          <div className="grid-2 report-grid">
            <Card>
              <CardHead title="Pipeline value by stage" sub="Open leads created in this period" />
              <div className="card-body pipeline-summary">
                {data.byStage.map((st) => (
                  <div key={st.label} className="pipe-row"><span className={`stage-badge tone-${st.color}`}><i />{st.label}</span><Meter value={st.count} max={Math.max(1, ...data.byStage.map((x) => x.count))} tone={st.color} /><strong className="tabular">{st.count}</strong><span className="muted tabular">{st.valueMinor ? money(st.valueMinor, cur, { compact: true }) : '—'}</span></div>
                ))}
              </div>
            </Card>
            <Card>
              <CardHead title="Campaigns" />
              <GroupTable rows={data.byCampaign} cur={cur} first="Campaign" extra={{ label: 'Cost / lead', value: (g) => (g.budgetMinor && g.leads ? money(Math.round(g.budgetMinor / g.leads), cur) : '—') }} />
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
