import { Users } from 'lucide-react';
import { get } from '../lib/api';
import { ago, money } from '../lib/format';
import { useQuery } from '../lib/query';
import { Link } from '../lib/router';
import { Avatar, Meter } from '../components/crm';
import { Badge, Card, CardHead, Empty, ErrorBox, PageHead, Skeleton } from '../components/ui';

interface Member {
  id: string;
  name: string;
  role: string;
  roleName?: string;
  lastLoginAt: string | null;
  openLeads: number;
  uncontacted: number;
  overdueTasks: number;
  viewingsWeek: number;
  openDeals: number;
  touchesWeek: number;
  pipelineMinor: number;
  lastActivityAt: string | null;
}

/** Operational visibility for managers: who is carrying what, and where attention is slipping. */
export default function CrmTeam() {
  const { data, error, refetch } = useQuery('crm:team', () => get<{ unassigned: number; members: Member[] }>('/admin/crm/team'));
  const maxLoad = Math.max(1, ...(data?.members.map((m) => m.openLeads) ?? [1]));
  return (
    <>
      <PageHead title="Sales team" sub={data ? `${data.members.length} people · ${data.unassigned} unassigned lead${data.unassigned === 1 ? '' : 's'}` : 'Workload and follow-through'}>
        {data && data.unassigned > 0 && <Link className="btn primary" to="/enquiries?view=unassigned">Assign {data.unassigned} lead{data.unassigned === 1 ? '' : 's'}</Link>}
      </PageHead>
      <Card>
        <CardHead title="Workload" icon={<Users size={18} />} sub="Open leads, what is slipping, and this week’s activity" />
        {error && <ErrorBox error={error} onRetry={refetch} />}
        {!data && !error && <div className="card-body"><Skeleton h={200} /></div>}
        {data && data.members.length === 0 && <Empty title="No salespeople yet" icon={<Users size={30} />}>Add users with the Sales agent or Sales manager role.</Empty>}
        {data && data.members.length > 0 && (
          <div className="table-wrap">
            <table className="table crm-cards">
              <thead><tr><th>Person</th><th>Open leads</th><th className="num">No first reply</th><th className="num">Overdue tasks</th><th className="num">Viewings (7d)</th><th className="num">Open deals</th><th className="num">Touches (7d)</th><th className="num">Pipeline</th><th>Last activity</th></tr></thead>
              <tbody>
                {data.members.map((m) => (
                  <tr key={m.id}>
                    <td data-label="Person"><span className="row" style={{ gap: 8 }}><Avatar name={m.name} /><span><strong>{m.name}</strong><div className="small muted">{m.roleName ?? m.role}</div></span></span></td>
                    <td data-label="Open leads"><Link to={`/enquiries?assignedTo=${m.id}&view=open`} className="row" style={{ gap: 8 }}><Meter value={m.openLeads} max={maxLoad} /><strong className="tabular">{m.openLeads}</strong></Link></td>
                    <td data-label="No first reply" className="num">{m.uncontacted ? <Badge tone="red" plain>{m.uncontacted}</Badge> : '0'}</td>
                    <td data-label="Overdue tasks" className="num">{m.overdueTasks ? <Link to={`/crm/tasks?assignee=${m.id}&range=overdue`}><Badge tone="red" plain>{m.overdueTasks}</Badge></Link> : '0'}</td>
                    <td data-label="Viewings" className="num">{m.viewingsWeek}</td>
                    <td data-label="Open deals" className="num">{m.openDeals}</td>
                    <td data-label="Touches" className="num">{m.touchesWeek}</td>
                    <td data-label="Pipeline" className="num">{money(m.pipelineMinor, 'USD', { compact: true })}</td>
                    <td data-label="Last activity" className="small muted">{m.lastActivityAt ? ago(m.lastActivityAt) : 'No activity'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
