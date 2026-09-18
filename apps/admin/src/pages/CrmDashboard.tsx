import { AlarmClock, ArrowRight, CalendarCheck, CircleAlert, Inbox, KanbanSquare, RefreshCw, UserRoundCheck } from 'lucide-react';
import { PIPELINE_STAGES, STAGE_LABEL } from '@avida/types';
import { get, post } from '../lib/api';
import { ago, date, dateTime, ENQUIRY_TONE } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { Link } from '../lib/router';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, CardHead, Empty, ErrorBox, LoadingPage, PageHead, Stat } from '../components/ui';

interface DeskLead {
  id: string;
  name: string;
  status?: string;
  intent?: string;
  createdAt?: string;
  followUpAt?: string;
  assignedTo: string | null;
  units?: string[];
  overdue?: boolean;
}

interface SalesDesk {
  firstResponseHours: number;
  uncontacted: DeskLead[];
  overdue: DeskLead[];
  viewingRequests: { id: string; name: string; requestedDate: string | null; requestedSlot: string | null; createdAt: string; units: string[] }[];
  upcomingViewings: { id: string; name: string; scheduledAt: string; agent: string | null; units: string[] }[];
  expiringReservations: { id: string; code: string; heldUntil: string; buyer: string | null; depositReceived: boolean }[];
  mine: number;
  notifications: { configured: boolean; sent: number; queued: number; undelivered: number; lastError: string | null };
}

interface Intelligence {
  stages: Record<string, number>;
}

export default function CrmDashboard() {
  const { can } = useAuth();
  const toast = useToast();
  const { data, error, refetch } = useQuery('crm:dashboard', async () => {
    const [desk, intelligence] = await Promise.all([
      get<SalesDesk>('/admin/sales-desk'),
      get<Intelligence>('/admin/sales-desk/intelligence'),
    ]);
    return { desk, intelligence };
  });

  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data) return <LoadingPage />;

  const { desk, intelligence } = data;
  const open = PIPELINE_STAGES.filter((stage) => stage !== 'SOLD').reduce((sum, stage) => sum + (intelligence.stages[stage] ?? 0), 0);
  const stageMax = Math.max(1, ...PIPELINE_STAGES.map((stage) => intelligence.stages[stage] ?? 0));
  const urgent = desk.uncontacted.filter((lead) => lead.overdue).length + desk.overdue.length + desk.viewingRequests.length + desk.expiringReservations.length;

  const retryNotifications = async () => {
    try {
      const result = await post<{ retried: number }>('/admin/sales-desk/notifications/retry');
      toast.success(result.retried ? `${result.retried} email${result.retried === 1 ? '' : 's'} queued again.` : 'There were no failed emails to retry.');
      invalidate('crm:dashboard', 'sales-desk');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <PageHead title="CRM command centre" sub="Your sales pipeline, today’s follow-ups and property-specific opportunities in one place.">
        <Link className="btn" to="/enquiries">All leads</Link>
        <Link className="btn primary" to="/pipeline"><KanbanSquare size={16} /> Open pipeline</Link>
      </PageHead>

      <div className="grid-4 crm-kpis">
        <Stat label="Open pipeline" value={open} sub="Active sales opportunities" icon={<Inbox size={20} />} tone="sky" to="/pipeline" />
        <Stat label="My active leads" value={desk.mine} sub="Assigned to you" icon={<UserRoundCheck size={20} />} tone="indigo" to="/enquiries?assignedTo=me" />
        <Stat label="Needs attention" value={urgent} sub="Follow-ups, requests and holds" icon={<CircleAlert size={20} />} tone={urgent ? 'orange' : 'green'} />
        <Stat label="Upcoming viewings" value={desk.upcomingViewings.length} sub="In the next seven days" icon={<CalendarCheck size={20} />} tone="teal" to="/viewings" />
      </div>

      <div className="crm-dashboard-grid">
        <Card>
          <CardHead title="Pipeline health" icon={<KanbanSquare size={18} />} sub="Live lead count at every stage.">
            <Link className="btn sm" to="/pipeline">Manage board <ArrowRight size={14} /></Link>
          </CardHead>
          <div className="card-body crm-funnel" aria-label="Lead pipeline by stage">
            {PIPELINE_STAGES.map((stage) => {
              const count = intelligence.stages[stage] ?? 0;
              return (
                <Link key={stage} to={`/enquiries?status=${stage}`} className="crm-funnel-row">
                  <span>{STAGE_LABEL[stage]}</span>
                  <span className="crm-funnel-track" aria-hidden="true"><i style={{ width: `${Math.max(count ? 8 : 0, (count / stageMax) * 100)}%` }} /></span>
                  <strong className="tabular">{count}</strong>
                </Link>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHead title="First response" icon={<AlarmClock size={18} />} sub={`Reply within ${desk.firstResponseHours} hours.`}>
            <Link className="btn sm" to="/enquiries?status=NEW">View new leads</Link>
          </CardHead>
          <div className="card-body crm-action-list">
            {desk.uncontacted.length === 0 && <Empty title="Every new lead has a response" />}
            {desk.uncontacted.map((lead) => (
              <Link key={lead.id} to={`/enquiries?open=${lead.id}`} className="crm-action-row">
                <span className={`crm-priority ${lead.overdue ? 'overdue' : ''}`} aria-hidden="true" />
                <span><strong>{lead.name}</strong><small>{lead.units?.join(', ') || lead.intent || 'General enquiry'} · {lead.createdAt ? ago(lead.createdAt) : 'new'}</small></span>
                <Badge tone={lead.overdue ? 'red' : 'amber'} plain>{lead.overdue ? 'Overdue' : 'New'}</Badge>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid-3 crm-queues">
        <Card>
          <CardHead title="Follow up now" sub={`${desk.overdue.length} overdue`} />
          <div className="card-body crm-action-list compact">
            {desk.overdue.length === 0 && <p className="muted small">Nothing overdue. Your team is up to date.</p>}
            {desk.overdue.map((lead) => (
              <Link key={lead.id} to={`/enquiries?open=${lead.id}`} className="crm-action-row">
                <span><strong>{lead.name}</strong><small>{lead.assignedTo ?? 'Unassigned'} · {lead.followUpAt ? date(lead.followUpAt) : 'Due'}</small></span>
                <Badge tone={ENQUIRY_TONE[lead.status ?? ''] ?? 'red'} plain>{STAGE_LABEL[lead.status ?? ''] ?? lead.status}</Badge>
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead title="Viewing desk" sub={`${desk.viewingRequests.length} to schedule · ${desk.upcomingViewings.length} upcoming`}>
            <Link className="btn sm" to="/viewings">Calendar</Link>
          </CardHead>
          <div className="card-body crm-action-list compact">
            {[...desk.viewingRequests.slice(0, 3).map((v) => ({ ...v, label: v.requestedDate ? `Requested ${date(v.requestedDate)}` : 'Needs scheduling', tone: 'amber' })), ...desk.upcomingViewings.slice(0, 3).map((v) => ({ ...v, label: dateTime(v.scheduledAt), tone: 'green' }))].map((viewing) => (
              <Link key={viewing.id} to={`/viewings?open=${viewing.id}`} className="crm-action-row">
                <span><strong>{viewing.name}</strong><small>{viewing.units.join(', ') || 'No residence selected'} · {viewing.label}</small></span>
                <Badge tone={viewing.tone} plain>{viewing.tone === 'amber' ? 'Request' : 'Booked'}</Badge>
              </Link>
            ))}
            {desk.viewingRequests.length + desk.upcomingViewings.length === 0 && <p className="muted small">No viewing requests or upcoming appointments.</p>}
          </div>
        </Card>

        <Card>
          <CardHead title="Reservation watch" sub="Holds approaching expiry">
            <Link className="btn sm" to="/reservations">All holds</Link>
          </CardHead>
          <div className="card-body crm-action-list compact">
            {desk.expiringReservations.length === 0 && <p className="muted small">No reservations are close to expiry.</p>}
            {desk.expiringReservations.map((reservation) => (
              <Link key={reservation.id} to="/reservations" className="crm-action-row">
                <span><strong>{reservation.code}</strong><small>{reservation.buyer ?? 'Buyer not linked'} · ends {date(reservation.heldUntil)}</small></span>
                <Badge tone={reservation.depositReceived ? 'green' : 'orange'} plain>{reservation.depositReceived ? 'Deposit paid' : 'No deposit'}</Badge>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {desk.notifications.undelivered > 0 && (
        <div className="alert warn crm-mail-health">
          <CircleAlert size={18} />
          <div><strong>{desk.notifications.undelivered} customer email{desk.notifications.undelivered === 1 ? '' : 's'} not delivered.</strong><div className="small">{desk.notifications.lastError ?? 'The delivery service needs attention.'}</div></div>
          {can('enquiry.edit') && <Button size="sm" icon={<RefreshCw size={14} />} onClick={() => void retryNotifications()}>Retry delivery</Button>}
        </div>
      )}
    </>
  );
}
