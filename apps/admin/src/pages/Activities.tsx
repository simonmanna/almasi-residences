import { useEffect, useState } from 'react';
import { Activity as ActivityIcon, ArrowDownLeft } from 'lucide-react';
import { LEAD_NOTE_LABEL } from '@avida/types';
import { get, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { relDay, type Activity } from '../lib/crm';
import { useQuery } from '../lib/query';
import { useTeam } from '../lib/ref';
import { Link, useDebounced, useSearchState } from '../lib/router';
import { StageBadge } from '../components/crm';
import { Badge, Card, Empty, ErrorBox, Input, PageHead, Pagination, Select, Skeleton } from '../components/ui';

type Row = Activity & { enquiry: { id: string; name: string; stage: { label: string; color: string } | null } };
interface Feed {
  data: Row[];
  meta: { total: number; page: number; pages: number };
  byKind: Record<string, number>;
}

const GROUPS: [string, string][] = [
  ['', 'Everything'],
  ['CALL', 'Calls'],
  ['WHATSAPP', 'WhatsApp'],
  ['EMAIL', 'Emails'],
  ['SMS', 'SMS'],
  ['MEETING', 'Meetings'],
  ['NOTE', 'Notes'],
  ['VIEWING', 'Viewings'],
  ['DEAL,RESERVATION', 'Deals & holds'],
  ['STATUS,ASSIGNMENT', 'Stage & owner'],
];

/** Every touch across the CRM, newest first — the team's diary. */
export default function Activities() {
  const { can } = useAuth();
  const { data: team } = useTeam();
  const [s, set] = useSearchState({ page: '1' });
  const [q, setQ] = useState(s.q ?? '');
  const term = useDebounced(q);
  useEffect(() => {
    if ((s.q ?? '') !== term) set({ q: term, page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);
  const query = qs({ kind: s.kind, authorId: s.authorId, from: s.from, to: s.to, page: s.page, q: s.q });
  const { data, error, refetch } = useQuery(`crm:activities:${query}`, () => get<Feed>(`/admin/crm/activities${query}`));
  let lastDay = '';

  return (
    <>
      <PageHead title="Activities" sub={data ? `${data.meta.total} entries · ${(data.byKind.CALL ?? 0) + (data.byKind.WHATSAPP ?? 0) + (data.byKind.EMAIL ?? 0)} conversations in the last 30 days` : 'Calls, messages, meetings and changes'} />
      <div className="view-tabs">
        {GROUPS.map(([v, l]) => (
          <button key={v} type="button" role="tab" aria-selected={(s.kind ?? '') === v} onClick={() => set({ kind: v || null, page: 1 })}>
            {l}
            {v && !v.includes(',') && data?.byKind[v] !== undefined && <span className="count">{data.byKind[v]}</span>}
          </button>
        ))}
      </div>
      <Card>
        <div className="toolbar">
          <Input style={{ maxWidth: 300 }} placeholder="Search text or lead name" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select className="sm" style={{ width: 'auto' }} value={s.authorId ?? ''} onChange={(e) => set({ authorId: e.target.value, page: 1 })} placeholder="Anyone" options={[{ value: 'me', label: 'Me' }, ...(can('enquiry.view-all') ? (team ?? []).map((t) => ({ value: t.id, label: t.name })) : [])]} />
          <Input type="date" className="sm" style={{ width: 'auto' }} value={s.from ?? ''} onChange={(e) => set({ from: e.target.value, page: 1 })} aria-label="From" />
          <Input type="date" className="sm" style={{ width: 'auto' }} value={s.to ?? ''} onChange={(e) => set({ to: e.target.value, page: 1 })} aria-label="To" />
        </div>
        {error && <ErrorBox error={error} onRetry={refetch} />}
        {!data && !error && <div className="card-body"><Skeleton h={300} /></div>}
        {data && data.data.length === 0 && <Empty title="No activity matches" icon={<ActivityIcon size={30} />} />}
        <div className="card-body">
          <ol className="feed wide">
            {data?.data.map((n) => {
              const day = relDay(n.createdAt, false);
              const head = day !== lastDay;
              lastDay = day;
              return (
                <li key={n.id} data-kind={n.kind} className={head ? 'first-of-day' : undefined}>
                  {head && <h4 className="tl-day">{day}</h4>}
                  <span className="feed-dot" aria-hidden="true" />
                  <div>
                    <div className="feed-head">
                      <Badge tone="grey" plain>{LEAD_NOTE_LABEL[n.kind] ?? n.kind}</Badge>
                      {n.direction === 'IN' && <span className="text-green small"><ArrowDownLeft size={12} /> customer</span>}
                      <Link to={`/crm/leads/${n.enquiry.id}`}><strong>{n.enquiry.name}</strong></Link>
                      {n.enquiry.stage && <StageBadge label={n.enquiry.stage.label} color={n.enquiry.stage.color} />}
                      <span className="muted small">{n.authorName} · {new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(n.createdAt))}{n.durationMin ? ` · ${n.durationMin} min` : ''}</span>
                    </div>
                    <p>{n.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
        {data && data.meta.pages > 1 && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(p) => set({ page: p })} />}
      </Card>
    </>
  );
}
