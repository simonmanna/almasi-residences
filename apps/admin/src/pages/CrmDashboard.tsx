import { useState } from 'react';
import { AlarmClock, ArrowRight, CalendarCheck, CircleDollarSign, Flame, Handshake, Inbox, KanbanSquare, KeyRound, Plus, Sparkles, Target, TrendingUp, UserPlus } from 'lucide-react';
import { LEAD_NOTE_LABEL, LEAD_SOURCE_LABEL, type LeadSourceValue } from '@avida/types';
import { get, patch } from '../lib/api';
import { useAuth } from '../lib/auth';
import { refreshCrm, relDay, type Task } from '../lib/crm';
import { ago, code as fmtCode, money, num } from '../lib/format';
import { useQuery } from '../lib/query';
import { Link } from '../lib/router';
import { useToast } from '../components/Toast';
import { Avatar, Meter, NewLeadModal, SectionTitle, StageBadge, TaskRow } from '../components/crm';
import { Badge, Button, Card, CardHead, Empty, ErrorBox, PageHead, Segmented, Skeleton } from '../components/ui';

interface Dashboard {
  scope: 'mine' | 'team';
  canTeam: boolean;
  currency: string;
  kpis: {
    newLeads: number;
    newLeadsPrev: number;
    openLeads: number;
    hotLeads: number;
    qualified: number;
    upcomingViewings: number;
    viewingRequests: number;
    overdueFollowUps: number;
    negotiations: number;
    reservations: number;
    soldCount: number;
    soldValueMinor: number;
    pipelineValueMinor: number;
    weightedValueMinor: number;
  };
  followUps: { overdue: number; today: number; upcoming: number; uncontacted: number; items: (Omit<Task, 'status' | 'assignedToId' | 'notes' | 'completedAt' | 'enquiryId' | 'enquiry'> & { lead: { id: string; name: string; phone: string | null; whatsapp: string | null; primaryUnit: { code: string } | null } | null; assignee: string | null })[] };
  viewingsToday: { id: string; name: string; scheduledAt: string; status: string; agent: string | null; enquiryId: string | null; units: string[] }[];
  unassigned: { id: string; name: string; createdAt: string; leadSource: string; score: number; units: string[] }[];
  pipeline: { id: string; label: string; color: string; category: string; probability: number; count: number; valueMinor: number; weightedMinor: number }[];
  funnel: { label: string; count: number }[];
  holds: { id: string; code: string; heldUntil: string; buyer: string | null; depositReceived: boolean; enquiryId: string | null; hoursLeft: number }[];
  recent: { id: string; kind: string; body: string; createdAt: string; author: string; lead: { id: string; name: string }; direction: string | null }[];
  myWeek: Record<string, number>;
  sources: { source: string; count: number }[];
}

function Kpi({ label, value, sub, icon, tone, to, alert }: { label: string; value: string | number; sub?: React.ReactNode; icon: React.ReactNode; tone: string; to?: string; alert?: boolean }) {
  const body = (
    <>
      <div className="kpi-top">
        <span className={`kpi-icon tone-${tone}`}>{icon}</span>
        <span className="kpi-label">{label}</span>
      </div>
      <div className={`kpi-value tabular ${alert ? 'is-alert' : ''}`}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </>
  );
  return to ? <Link to={to} className="kpi">{body}</Link> : <div className="kpi">{body}</div>;
}

/** The CRM home: what needs doing today, and the state of the pipeline, readable in five seconds. */
export default function CrmDashboard() {
  const { can, user } = useAuth();
  const toast = useToast();
  const [scope, setScope] = useState<'team' | 'mine'>('team');
  const [adding, setAdding] = useState(false);
  const { data, error, refetch } = useQuery(`crm:dashboard:${scope}`, () => get<Dashboard>(`/admin/crm/dashboard?scope=${scope}`));

  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  const k = data?.kpis;
  const cur = data?.currency ?? 'USD';
  const delta = k ? k.newLeads - k.newLeadsPrev : 0;
  const funnelMax = Math.max(1, ...(data?.funnel.map((f) => f.count) ?? [1]));
  const stageMax = Math.max(1, ...(data?.pipeline.map((s) => s.count) ?? [1]));
  const sourceMax = Math.max(1, ...(data?.sources.map((s) => s.count) ?? [1]));
  const hour = new Date().getHours();

  const claim = async (id: string, name: string) => {
    try {
      await patch(`/admin/enquiries/${id}`, { assignedToId: user!.id });
      toast.success(`${name} is yours.`);
      refreshCrm();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <PageHead
        title={`Good ${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}, ${user?.name.split(' ')[0] ?? ''}`}
        sub={k ? `${k.overdueFollowUps ? `${k.overdueFollowUps} overdue follow-up${k.overdueFollowUps === 1 ? '' : 's'} · ` : ''}${data!.followUps.today} due today · ${data!.viewingsToday.length} viewing${data!.viewingsToday.length === 1 ? '' : 's'} today` : 'Loading your day…'}
      >
        {data?.canTeam && <Segmented value={scope} onChange={setScope} options={[{ value: 'team', label: 'Team' }, { value: 'mine', label: 'Mine' }]} />}
        {can('enquiry.edit') && <Button icon={<Plus size={16} />} onClick={() => setAdding(true)}>New lead</Button>}
        <Link className="btn primary" to="/pipeline"><KanbanSquare size={16} /> Pipeline</Link>
      </PageHead>

      <div className="kpi-grid">
        {!k && Array.from({ length: 8 }, (_, i) => <div key={i} className="kpi"><Skeleton h={62} /></div>)}
        {k && (
          <>
            <Kpi label="New leads · 30 days" value={k.newLeads} icon={<Inbox size={17} />} tone="blue" to="/enquiries?view=new" sub={<span className={delta >= 0 ? 'up' : 'down'}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)} vs previous 30</span>} />
            <Kpi label="Qualified & beyond" value={k.qualified} icon={<Target size={17} />} tone="teal" to="/enquiries?view=open&sort=score" sub={`${k.hotLeads} hot · ${k.openLeads} open`} />
            <Kpi label="Viewings · 7 days" value={k.upcomingViewings} icon={<CalendarCheck size={17} />} tone="purple" to="/viewings" sub={k.viewingRequests ? `${k.viewingRequests} request${k.viewingRequests === 1 ? '' : 's'} to schedule` : 'No requests waiting'} />
            <Kpi label="Overdue follow-ups" value={k.overdueFollowUps} icon={<AlarmClock size={17} />} tone={k.overdueFollowUps ? 'red' : 'green'} to="/crm/tasks?range=overdue" alert={k.overdueFollowUps > 0} sub={k.overdueFollowUps ? 'Clear these first' : 'All caught up'} />
            <Kpi label="Negotiations" value={k.negotiations} icon={<Handshake size={17} />} tone="orange" to="/crm/deals" sub="Open deals" />
            <Kpi label="Reservations" value={k.reservations} icon={<KeyRound size={17} />} tone="indigo" to="/reservations" sub="Active holds" />
            <Kpi label="Sold · 90 days" value={k.soldCount} icon={<Sparkles size={17} />} tone="green" to="/crm/deals?status=SOLD" sub={money(k.soldValueMinor, cur, { compact: true })} />
            <Kpi label="Pipeline value" value={money(k.pipelineValueMinor, cur, { compact: true })} icon={<CircleDollarSign size={17} />} tone="sky" to="/crm/reports" sub={`${money(k.weightedValueMinor, cur, { compact: true })} weighted`} />
          </>
        )}
      </div>

      <div className="crm-home-grid">
        <div className="stack">
          <Card>
            <CardHead title="Today’s work" icon={<AlarmClock size={18} />} sub={data ? `${data.followUps.overdue} overdue · ${data.followUps.today} today · ${data.followUps.upcoming} upcoming` : undefined}>
              <Link className="btn sm" to="/crm/tasks">All tasks <ArrowRight size={14} /></Link>
            </CardHead>
            {data && (
              <div className="bucket-strip">
                <Link to="/crm/tasks?range=overdue" className="bucket red"><strong className="tabular">{data.followUps.overdue}</strong><span>Overdue</span></Link>
                <Link to="/crm/tasks?range=today" className="bucket amber"><strong className="tabular">{data.followUps.today}</strong><span>Due today</span></Link>
                <Link to="/crm/tasks" className="bucket green"><strong className="tabular">{data.followUps.upcoming}</strong><span>Upcoming</span></Link>
                {data.followUps.uncontacted > 0 && <Link to="/enquiries?view=overdue" className="bucket red"><strong className="tabular">{data.followUps.uncontacted}</strong><span>No first reply</span></Link>}
              </div>
            )}
            <div className="card-body task-list">
              {!data && <Skeleton h={160} />}
              {data && data.followUps.items.length === 0 && <Empty title="Nothing due" icon={<AlarmClock size={26} />}>No follow-ups in the next three days. Plan the next step on your hottest leads.</Empty>}
              {data?.followUps.items.slice(0, 9).map((t) => (
                <TaskRow key={t.id} task={{ ...t, status: 'OPEN', assignedToId: null, notes: null, completedAt: null, enquiryId: t.lead?.id ?? null, enquiry: t.lead ? { id: t.lead.id, name: t.lead.name, phone: t.lead.phone, whatsapp: t.lead.whatsapp, email: null, status: '', stage: null } : null, unit: t.lead?.primaryUnit ? { id: '', code: t.lead.primaryUnit.code } : null, assignedTo: data.scope === 'team' && t.assignee ? { id: '', name: t.assignee } : null }} />
              ))}
            </div>
          </Card>

          <Card>
            <CardHead title="Pipeline" icon={<KanbanSquare size={18} />} sub="Leads and value in every stage">
              <Link className="btn sm" to="/pipeline">Open board <ArrowRight size={14} /></Link>
            </CardHead>
            <div className="card-body pipeline-summary">
              {!data && <Skeleton h={220} />}
              {data?.pipeline.map((s) => (
                <Link key={s.id} to={`/enquiries?stageId=${s.id}`} className="pipe-row">
                  <StageBadge label={s.label} color={s.color} />
                  <Meter value={s.count} max={stageMax} tone={s.color} />
                  <strong className="tabular">{s.count}</strong>
                  <span className="tabular muted">{s.valueMinor ? money(s.valueMinor, cur, { compact: true }) : '—'}</span>
                </Link>
              ))}
            </div>
          </Card>

          <Card>
            <CardHead title="Recent activity" icon={<TrendingUp size={18} />}>
              <Link className="btn sm" to="/crm/activities">Activity feed <ArrowRight size={14} /></Link>
            </CardHead>
            <div className="card-body">
              {!data && <Skeleton h={180} />}
              {data && data.recent.length === 0 && <Empty title="No activity yet" />}
              <ol className="feed">
                {data?.recent.slice(0, 12).map((n) => (
                  <li key={n.id} data-kind={n.kind}>
                    <span className="feed-dot" aria-hidden="true" />
                    <div>
                      <div className="feed-head"><Badge tone="grey" plain>{LEAD_NOTE_LABEL[n.kind] ?? n.kind}</Badge> <Link to={`/crm/leads/${n.lead.id}`}><strong>{n.lead.name}</strong></Link> <span className="muted small">· {n.author} · {ago(n.createdAt)}</span></div>
                      <p>{n.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </Card>
        </div>

        <div className="stack">
          <Card>
            <CardHead title="Today’s viewings" icon={<CalendarCheck size={18} />}>
              <Link className="btn sm" to="/viewings">Calendar</Link>
            </CardHead>
            <div className="card-body compact-list">
              {!data && <Skeleton h={80} />}
              {data && data.viewingsToday.length === 0 && <p className="muted small">No viewings today.</p>}
              {data?.viewingsToday.map((v) => (
                <Link key={v.id} to={v.enquiryId ? `/crm/leads/${v.enquiryId}` : `/viewings?open=${v.id}`} className="compact-row">
                  <span className="time tabular">{new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(v.scheduledAt))}</span>
                  <span className="grow"><strong>{v.name}</strong><small>{v.units.map(fmtCode).join(', ') || 'Residence to choose'}{v.agent ? ` · ${v.agent}` : ''}</small></span>
                  <Badge tone={v.status === 'CONFIRMED' ? 'green' : 'purple'} plain>{v.status.toLowerCase()}</Badge>
                </Link>
              ))}
            </div>
          </Card>

          <Card>
            <CardHead title={data?.scope === 'team' ? 'Unassigned leads' : 'New leads to pick up'} icon={<UserPlus size={18} />}>
              <Link className="btn sm" to="/enquiries?view=unassigned">All</Link>
            </CardHead>
            <div className="card-body compact-list">
              {data && data.unassigned.length === 0 && <p className="muted small">Every lead has an owner.</p>}
              {data?.unassigned.map((l) => (
                <div key={l.id} className="compact-row">
                  <Avatar name={null} />
                  <Link to={`/crm/leads/${l.id}`} className="grow"><strong>{l.name}</strong><small>{LEAD_SOURCE_LABEL[l.leadSource as LeadSourceValue]}{l.units.length ? ` · ${l.units.map(fmtCode).join(', ')}` : ''} · {ago(l.createdAt)}</small></Link>
                  {can('enquiry.edit') && <Button size="xs" onClick={() => void claim(l.id, l.name)}>Take it</Button>}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHead title="Sales funnel" icon={<Target size={18} />} sub="Leads from the last 90 days, by the furthest stage they reached" />
            <div className="card-body funnel">
              {!data && <Skeleton h={180} />}
              {data?.funnel.map((f, i) => (
                <div key={f.label} className="funnel-step">
                  <span>{f.label}</span>
                  <span className="funnel-bar"><i style={{ width: `${Math.max(f.count ? 4 : 0, (f.count / funnelMax) * 100)}%`, opacity: 1 - i * 0.09 }} /></span>
                  <strong className="tabular">{f.count}</strong>
                  <span className="muted small tabular">{i > 0 && data.funnel[0]!.count ? `${Math.round((f.count / data.funnel[0]!.count) * 100)}%` : ''}</span>
                </div>
              ))}
            </div>
          </Card>

          {data && data.holds.length > 0 && (
            <Card>
              <CardHead title="Reservations" icon={<KeyRound size={18} />} sub="Active holds, soonest to lapse first">
                <Link className="btn sm" to="/reservations">All</Link>
              </CardHead>
              <div className="card-body compact-list">
                {data.holds.slice(0, 5).map((r) => (
                  <Link key={r.id} to={r.enquiryId ? `/crm/leads/${r.enquiryId}` : '/reservations'} className="compact-row">
                    <strong className="code-tag">{fmtCode(r.code)}</strong>
                    <span className="grow"><strong>{r.buyer ?? 'Buyer not linked'}</strong><small>ends {relDay(r.heldUntil, false)}</small></span>
                    <Badge tone={r.hoursLeft < 48 ? 'red' : r.depositReceived ? 'green' : 'orange'} plain>{r.hoursLeft < 48 ? `${Math.max(0, r.hoursLeft)}h left` : r.depositReceived ? 'Deposit paid' : 'No deposit'}</Badge>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <CardHead title="My week" icon={<Flame size={18} />} sub="Your logged touches in the last 7 days" />
            <div className="card-body my-week">
              {(['CALL', 'WHATSAPP', 'EMAIL', 'MEETING', 'VIEWING', 'NOTE'] as const).map((kind) => (
                <div key={kind}><strong className="tabular">{num(data?.myWeek[kind] ?? 0)}</strong><span>{LEAD_NOTE_LABEL[kind]}{kind === 'NOTE' ? 's' : kind === 'WHATSAPP' ? '' : 's'}</span></div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHead title="Lead sources" icon={<Inbox size={18} />} sub="Last 90 days">
              {can('reports.view') && <Link className="btn sm" to="/crm/reports">Reports</Link>}
            </CardHead>
            <div className="card-body source-list">
              {data?.sources.map((s) => (
                <div key={s.source} className="source-row">
                  <span>{LEAD_SOURCE_LABEL[s.source as LeadSourceValue] ?? s.source}</span>
                  <Meter value={s.count} max={sourceMax} />
                  <strong className="tabular">{s.count}</strong>
                </div>
              ))}
              {data && data.sources.length === 0 && <p className="muted small">No leads in the last 90 days.</p>}
            </div>
          </Card>
        </div>
      </div>
      {adding && <NewLeadModal onClose={() => setAdding(false)} />}
    </>
  );
}
