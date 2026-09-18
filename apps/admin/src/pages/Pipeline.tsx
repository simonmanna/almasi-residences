import { useDeferredValue, useMemo, useState } from 'react';
import { AlarmClock, Inbox, KanbanSquare, Search, UserRound } from 'lucide-react';
import { PIPELINE_STAGES, STAGE_LABEL } from '@avida/types';
import { get, patch, qs } from '../lib/api';
import { ago, code as fmtCode, date, ENQUIRY_TONE } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { useTeam } from '../lib/ref';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/Toast';
import { Badge, Button, Empty, ErrorBox, Input, PageHead, Select, Skeleton } from '../components/ui';
import { LeadDrawer, type LeadRow, type ListData } from './Enquiries';

const OPEN_STAGES = PIPELINE_STAGES.filter((stage) => stage !== 'SOLD');

export default function Pipeline() {
  const { can } = useAuth();
  const toast = useToast();
  const { data: team } = useTeam();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const [owner, setOwner] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const query = qs({ status: OPEN_STAGES.join(','), pageSize: 200 });
  const { data, error, refetch } = useQuery(`crm:pipeline:${query}`, () => get<ListData>(`/admin/enquiries${query}`));

  const filtered = useMemo(() => {
    const rows = data?.data ?? [];
    return rows.filter((lead) => {
      const text = `${lead.name} ${lead.email} ${lead.phone} ${lead.units.map((unit) => unit.code).join(' ')}`.toLowerCase();
      const ownerMatch = !owner || (owner === 'none' ? !lead.assignedToId : lead.assignedToId === owner);
      return ownerMatch && (!deferredSearch || text.includes(deferredSearch));
    });
  }, [data, deferredSearch, owner]);

  const byStage = useMemo(() => Object.fromEntries(OPEN_STAGES.map((stage) => [stage, filtered.filter((lead) => lead.status === stage)])) as Record<string, LeadRow[]>, [filtered]);

  const move = async (lead: LeadRow, status: string) => {
    if (status === lead.status) return;
    setMoving(lead.id);
    try {
      await patch(`/admin/enquiries/${lead.id}`, { status });
      toast.success(`${lead.name} moved to ${STAGE_LABEL[status]}.`);
      invalidate('crm:pipeline', 'crm:dashboard', 'enquiries', 'dashboard', 'sales-desk');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setMoving(null);
    }
  };

  return (
    <>
      <PageHead title="Sales pipeline" sub={data ? `${filtered.length} visible opportunities · ${data.overdue} overdue across the CRM` : 'Move every opportunity from first enquiry to reservation.'}>
        <Button onClick={() => refetch()}>Refresh</Button>
      </PageHead>

      <div className="crm-board-toolbar" aria-label="Pipeline filters">
        <label className="crm-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search leads</span><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search lead or residence" /></label>
        <Select value={owner} onChange={(event) => setOwner(event.target.value)} placeholder="All owners" options={[{ value: 'none', label: 'Unassigned' }, ...(team ?? []).map((member) => ({ value: member.id, label: member.name }))]} />
        <span className="muted small">Use each card’s stage menu to move it. This works with keyboard and touch.</span>
      </div>

      {error && <ErrorBox error={error} onRetry={refetch} />}
      {!data && !error && <div className="crm-board-loading"><Skeleton h={360} /></div>}
      {data && (
        <div className="crm-board" aria-label="Lead pipeline board">
          {OPEN_STAGES.map((stage) => (
            <section key={stage} className="crm-column" aria-labelledby={`stage-${stage}`}>
              <header className="crm-column-head">
                <span className={`crm-stage-dot tone-${ENQUIRY_TONE[stage] ?? 'grey'}`} aria-hidden="true" />
                <h2 id={`stage-${stage}`}>{STAGE_LABEL[stage]}</h2>
                <strong className="tabular">{byStage[stage]?.length ?? 0}</strong>
              </header>
              <div className="crm-column-body">
                {(byStage[stage] ?? []).map((lead) => (
                  <article key={lead.id} className={`crm-lead-card ${lead.overdue ? 'is-overdue' : ''}`}>
                    <button type="button" className="crm-lead-open" onClick={() => setOpen(lead.id)}>
                      <span className="crm-lead-title"><strong>{lead.name}</strong>{lead.overdue && <Badge tone="red" plain>Overdue</Badge>}</span>
                      <span className="crm-lead-units">{lead.units.length ? lead.units.map((unit) => fmtCode(unit.code)).join(', ') : 'General enquiry'}</span>
                      <span className="crm-lead-meta"><UserRound size={13} aria-hidden="true" /> {lead.assignedToName ?? 'Unassigned'}</span>
                      <span className="crm-lead-meta"><AlarmClock size={13} aria-hidden="true" /> {lead.followUpAt ? `Follow up ${date(lead.followUpAt)}` : `Updated ${ago(lead.lastActivityAt ?? lead.createdAt)}`}</span>
                    </button>
                    {can('enquiry.edit') && (
                      <label className="crm-stage-select">
                        <span className="sr-only">Move {lead.name} to stage</span>
                        <select value={lead.status} disabled={moving === lead.id} onChange={(event) => void move(lead, event.target.value)}>
                          {OPEN_STAGES.map((option) => <option key={option} value={option}>{STAGE_LABEL[option]}</option>)}
                        </select>
                      </label>
                    )}
                  </article>
                ))}
                {(byStage[stage]?.length ?? 0) === 0 && <Empty title="No leads" icon={<Inbox size={24} />} />}
              </div>
            </section>
          ))}
        </div>
      )}
      {open && <LeadDrawer id={open} onClose={() => setOpen(null)} />}
    </>
  );
}
