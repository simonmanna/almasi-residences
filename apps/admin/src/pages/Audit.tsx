import { Fragment, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, History } from 'lucide-react';
import { humanise } from '@avida/types';
import { get, qs } from '../lib/api';
import { dateTime } from '../lib/format';
import { useQuery } from '../lib/query';
import { useDebounced, useSearchState } from '../lib/router';
import type { Paged } from '../lib/types';
import { Card, Empty, ErrorBox, Input, PageHead, Pagination, Select, Skeleton } from '../components/ui';

interface AuditRow {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  target: string | null;
  summary: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  rowCount: number | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  actor: { id: string; name: string; role: string };
}

const show = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** §28 — every consequential change: who, what, which record, before and after. */
export default function Audit() {
  const [s, set] = useSearchState({ page: '1' });
  const [q, setQ] = useState(s.q ?? '');
  const term = useDebounced(q);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    if ((s.q ?? '') !== term) set({ q: term, page: 1 });
  }, [term, s.q, set]);
  const query = qs({ q: s.q, actorId: s.actorId, entity: s.entity, action: s.action, from: s.from, to: s.to, page: s.page, pageSize: 50 });
  const { data, error } = useQuery(`audit:${query}`, () => get<Paged<AuditRow>>(`/admin/audit${query}`));
  const { data: facets } = useQuery('audit:facets', () => get<{ actions: { value: string }[]; entities: { value: string }[]; actors: { id: string; name: string }[] }>('/admin/audit/facets'));
  const groups = [...new Set((facets?.actions ?? []).map((a) => a.value.split('.')[0]!))];

  return (
    <>
      <PageHead title="Activity & audit log" sub={data ? `${data.meta.total} recorded actions` : ' '} />
      <Card>
        <div className="card-head">
          <Input className="sm" style={{ maxWidth: 260 }} placeholder="Search summaries and records" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select className="sm" style={{ width: 'auto' }} value={s.actorId ?? ''} onChange={(e) => set({ actorId: e.target.value, page: 1 })} placeholder="Anyone" options={(facets?.actors ?? []).map((a) => ({ value: a.id, label: a.name }))} />
          <Select className="sm" style={{ width: 'auto' }} value={s.entity ?? ''} onChange={(e) => set({ entity: e.target.value, page: 1 })} placeholder="Any record" options={(facets?.entities ?? []).map((e) => ({ value: e.value, label: humanise(e.value) }))} />
          <Select className="sm" style={{ width: 'auto' }} value={s.action ?? ''} onChange={(e) => set({ action: e.target.value, page: 1 })} placeholder="Any action" options={groups.map((g) => ({ value: g, label: humanise(g) }))} />
          <Input className="sm" type="date" style={{ width: 150 }} value={s.from ?? ''} onChange={(e) => set({ from: e.target.value, page: 1 })} aria-label="From" />
          <Input className="sm" type="date" style={{ width: 150 }} value={s.to ?? ''} onChange={(e) => set({ to: e.target.value, page: 1 })} aria-label="To" />
        </div>
        {error && <div className="card-body"><ErrorBox error={error} /></div>}
        <div className="table-wrap" style={{ padding: '0 14px 14px' }}>
          <table className="table">
            <thead><tr><th style={{ width: 28 }} /><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>What changed</th></tr></thead>
            <tbody>
              {!data && Array.from({ length: 8 }, (_, i) => <tr key={i}><td colSpan={6}><Skeleton h={20} /></td></tr>)}
              {(data?.data ?? []).map((r) => (
                <Fragment key={r.id}>
                  <tr data-clickable="true" onClick={() => setOpen(open === r.id ? null : r.id)}>
                    <td>{open === r.id ? <ChevronDown size={15} /> : <ChevronRight size={15} className="faint" />}</td>
                    <td className="muted small nowrap">{dateTime(r.createdAt)}</td>
                    <td>{r.actor.name}</td>
                    <td><code className="small">{r.action}</code></td>
                    <td>{r.target ?? '—'}</td>
                    <td>{r.summary ?? '—'}{r.rowCount && r.rowCount > 1 ? <span className="muted small"> · {r.rowCount} records</span> : null}</td>
                  </tr>
                  {open === r.id && (
                    <tr>
                      <td />
                      <td colSpan={5} style={{ background: 'var(--sky-25)' }}>
                        {(r.before || r.after) ? (
                          <table className="table" style={{ background: '#fff', borderRadius: 10 }}>
                            <thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
                            <tbody>
                              {[...new Set([...Object.keys(r.before ?? {}), ...Object.keys(r.after ?? {})])].map((k) => (
                                <tr key={k}><td>{k}</td><td className="muted">{show(r.before?.[k])}</td><td>{show(r.after?.[k])}</td></tr>
                              ))}
                            </tbody>
                          </table>
                        ) : <p className="muted small" style={{ margin: 0 }}>No field values recorded for this action.</p>}
                        <p className="faint small" style={{ margin: '8px 0 0' }}>{r.entity ? `${humanise(r.entity)} ${r.entityId ?? ''}` : ''}{r.ip ? ` · ${r.ip}` : ''}{r.userAgent ? ` · ${r.userAgent.slice(0, 80)}` : ''}</p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {data?.data.length === 0 && <Empty title="Nothing recorded for these filters" icon={<History size={32} />} />}
        </div>
        <div className="table-foot">{data && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(p) => set({ page: p })} />}</div>
      </Card>
    </>
  );
}
