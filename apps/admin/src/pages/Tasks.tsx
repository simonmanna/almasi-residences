import { useMemo, useState } from 'react';
import { ListTodo, Plus } from 'lucide-react';
import { taskBucket, TASK_TYPE_LABEL, TASK_TYPES } from '@avida/types';
import { get, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Task } from '../lib/crm';
import { useQuery } from '../lib/query';
import { useTeam } from '../lib/ref';
import { useSearchState } from '../lib/router';
import { TaskModal, TaskRow } from '../components/crm';
import { Button, Card, Empty, ErrorBox, PageHead, Segmented, Select, Skeleton } from '../components/ui';

interface TaskList {
  data: Task[];
  counts: { overdue: number; today: number; upcoming: number; undated: number };
}

const BUCKETS = [
  { key: 'overdue', label: 'Overdue', tone: 'red' },
  { key: 'today', label: 'Today', tone: 'amber' },
  { key: 'tomorrow', label: 'Tomorrow', tone: 'green' },
  { key: 'upcoming', label: 'Upcoming', tone: 'sky' },
  { key: 'someday', label: 'No date', tone: 'grey' },
] as const;

/** Every follow-up, grouped by when it is due. Overdue work comes first and looks it. */
export default function Tasks() {
  const { can } = useAuth();
  const { data: team } = useTeam();
  const [s, set] = useSearchState();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const status = s.status ?? 'open';
  const query = qs({ assignee: s.assignee, status: status === 'open' ? undefined : status, type: s.type, range: s.range });
  const { data, error, refetch } = useQuery(`crm:tasks:${query}`, () => get<TaskList>(`/admin/crm/tasks${query}`));
  const grouped = useMemo(() => {
    const now = new Date();
    const g: Record<string, Task[]> = {};
    for (const t of data?.data ?? []) (g[status === 'done' ? 'done' : taskBucket(t.dueAt, now)] ??= []).push(t);
    return g;
  }, [data, status]);

  return (
    <>
      <PageHead title="Tasks & follow-ups" sub={data ? `${data.counts.overdue} overdue · ${data.counts.today} due today · ${data.counts.upcoming} upcoming` : 'What needs doing, and when'}>
        {can('enquiry.edit') && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAdding(true)}>New task</Button>}
      </PageHead>

      {data && (
        <div className="bucket-strip page">
          <button type="button" className="bucket red" onClick={() => set({ range: s.range === 'overdue' ? null : 'overdue' })} aria-pressed={s.range === 'overdue'}><strong className="tabular">{data.counts.overdue}</strong><span>Overdue</span></button>
          <button type="button" className="bucket amber" onClick={() => set({ range: s.range === 'today' ? null : 'today' })} aria-pressed={s.range === 'today'}><strong className="tabular">{data.counts.today}</strong><span>Due today</span></button>
          <button type="button" className="bucket green" onClick={() => set({ range: null })} aria-pressed={!s.range}><strong className="tabular">{data.counts.upcoming}</strong><span>Upcoming</span></button>
          <div className="bucket grey"><strong className="tabular">{data.counts.undated}</strong><span>No date</span></div>
        </div>
      )}

      <Card>
        <div className="toolbar">
          <Segmented value={status} onChange={(v) => set({ status: v === 'open' ? null : v })} options={[{ value: 'open', label: 'Open' }, { value: 'done', label: 'Done (14 days)' }]} />
          {can('enquiry.view', 'TEAM') && <Select className="sm" style={{ width: 'auto' }} value={s.assignee ?? ''} onChange={(e) => set({ assignee: e.target.value })} placeholder="My tasks" options={[{ value: 'all', label: 'Everyone' }, { value: 'none', label: 'Unassigned' }, ...(team ?? []).map((t) => ({ value: t.id, label: t.name }))]} />}
          <Select className="sm" style={{ width: 'auto' }} value={s.type ?? ''} onChange={(e) => set({ type: e.target.value })} placeholder="Any type" options={TASK_TYPES.map((t) => ({ value: t, label: TASK_TYPE_LABEL[t] }))} />
        </div>
        {error && <ErrorBox error={error} onRetry={refetch} />}
        {!data && !error && <div className="card-body"><Skeleton h={200} /></div>}
        {data && data.data.length === 0 && <Empty title={status === 'done' ? 'Nothing completed recently' : 'You are all caught up'} icon={<ListTodo size={30} />}>{status === 'done' ? '' : 'No open tasks. Plan the next step on your hottest leads.'}</Empty>}
        <div className="card-body task-groups">
          {(status === 'done' ? [{ key: 'done', label: 'Completed', tone: 'green' }] : BUCKETS).map((b) =>
            grouped[b.key]?.length ? (
              <section key={b.key} className={`task-group tone-line-${b.tone}`}>
                <h3>{b.label} <span className="count">{grouped[b.key]!.length}</span></h3>
                <div className="task-list">{grouped[b.key]!.map((t) => <TaskRow key={t.id} task={t} onEdit={can('enquiry.edit') ? setEditing : undefined} />)}</div>
              </section>
            ) : null,
          )}
        </div>
      </Card>
      {adding && <TaskModal onClose={() => setAdding(false)} />}
      {editing && <TaskModal task={editing} enquiryId={editing.enquiryId} leadName={editing.enquiry?.name} onClose={() => setEditing(null)} />}
    </>
  );
}
