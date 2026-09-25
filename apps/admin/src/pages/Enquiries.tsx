import { useEffect, useRef, useState } from 'react';
import { AlarmClock, Archive, Bookmark, CheckSquare, Download, Filter, Inbox, Plus, Search, ShieldAlert, Tag, Trash2, X } from 'lucide-react';
import { humanise, LEAD_SOURCE_LABEL, LEAD_SOURCES, TEMPERATURE_LABEL, type LeadSourceValue } from '@avida/types';
import { del, downloadUrl, get, post, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { isPast, refreshCrm, relDay, type LeadList, type Stage } from '../lib/crm';
import { ago, code as fmtCode, money } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { useTeam, useTypes } from '../lib/ref';
import { navigate, useDebounced, useSearchState } from '../lib/router';
import { useToast } from '../components/Toast';
import { Avatar, LostModal, NewLeadModal, PriorityBadge, ScorePill, StageBadge, TempBadge } from '../components/crm';
import { Badge, Button, Card, Checkbox, Empty, ErrorBox, Field, Input, Menu, Modal, PageHead, Pagination, Select, Skeleton } from '../components/ui';

export type { LeadRow, LeadList as ListData } from '../lib/crm';

const VIEWS = [
  { value: '', label: 'All leads' },
  { value: 'mine', label: 'My leads' },
  { value: 'new', label: 'New' },
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'closed', label: 'Closed' },
  { value: 'archived', label: 'Archived' },
] as const;

const FILTER_KEYS = ['stageId', 'assignedTo', 'leadSource', 'temperature', 'typologyId', 'bedrooms', 'budgetMin', 'budgetMax', 'createdFrom', 'createdTo', 'followUp', 'lastActivity', 'tag', 'priority', 'campaignId'] as const;

interface SavedView {
  id: string;
  name: string;
  filters: Record<string, string>;
  shared: boolean;
  userId: string;
  user: { name: string };
}

/** CRM — every lead, searchable and filterable, with bulk actions for managers. */
export default function Enquiries() {
  const { can, user } = useAuth();
  const toast = useToast();
  const { data: team } = useTeam();
  const { data: types } = useTypes();
  const [s, set] = useSearchState({ page: '1' });
  const [q, setQ] = useState(s.q ?? '');
  const term = useDebounced(q);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLost, setBulkLost] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Old links (/enquiries?open=…) land on the lead's own page.
  useEffect(() => {
    if (s.open) navigate(`/crm/leads/${s.open}`, { replace: true });
  }, [s.open]);
  useEffect(() => {
    if ((s.q ?? '') !== term) set({ q: term, page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'n' && can('enquiry.edit')) (e.preventDefault(), setAdding(true));
      if (e.key === 'f') (e.preventDefault(), searchRef.current?.focus());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [can]);

  const query = qs({ view: s.view, q: s.q, page: s.page, sort: s.sort, status: s.status, ...Object.fromEntries(FILTER_KEYS.map((k) => [k, s[k]])) });
  const { data, error, refetch } = useQuery(`enquiries:${query}`, () => get<LeadList>(`/admin/enquiries${query}`));
  const { data: stages } = useQuery('crm:stages', () => get<(Stage & { leadCount: number })[]>('/admin/crm/stages'));
  const { data: views } = useQuery('crm:views:leads', () => get<SavedView[]>('/admin/crm/views?scope=leads'));
  const editable = can('enquiry.edit');
  const activeFilters = FILTER_KEYS.filter((k) => s[k]);

  const bulk = async (payload: Record<string, unknown>, msg: string) => {
    try {
      await post('/admin/enquiries/bulk', { ids: [...selected], ...payload });
      toast.success(msg);
      setSelected(new Set());
      refreshCrm();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const rows = data?.data ?? [];
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const counts: Record<string, number | undefined> = data ? { '': data.meta.total, mine: data.mine, new: data.new, unassigned: data.unassigned, overdue: data.overdue } : {};

  const applyView = (v: SavedView) => set({ ...Object.fromEntries([...FILTER_KEYS, 'view', 'sort', 'q'].map((k) => [k, v.filters[k] ?? null])), page: 1 });

  return (
    <>
      <PageHead title="Leads and Enquiries" sub={data ? `${data.meta.total} ${s.view ? VIEWS.find((v) => v.value === s.view)?.label.toLowerCase() : 'leads'} · ${data.overdue} overdue · ${data.unassigned} unassigned` : 'Every lead, from every source'}>
        {can('enquiry.export') && <a className="btn" href={downloadUrl(`/admin/enquiries/export.csv${query}`)}><Download size={15} /> Export</a>}
        {editable && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAdding(true)} title="Shortcut: N">New lead</Button>}
      </PageHead>

      <div className="view-tabs" role="tablist" aria-label="Lead views">
        {VIEWS.filter((v) => v.value !== 'archived' || can('enquiry.archive')).map((v) => (
          <button key={v.value} type="button" role="tab" aria-selected={(s.view ?? '') === v.value} onClick={() => set({ view: v.value || null, page: 1 })}>
            {v.label}
            {counts[v.value] !== undefined && <span className={`count ${v.value === 'overdue' && counts[v.value] ? 'alert' : ''}`}>{counts[v.value]}</span>}
          </button>
        ))}
      </div>

      <Card>
        <div className="toolbar lead-toolbar">
          <label className="crm-search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search leads</span>
            <Input ref={searchRef} placeholder="Name, phone, email, residence or tag  (F)" value={q} onChange={(ev) => setQ(ev.target.value)} />
          </label>
          <Select className="sm" style={{ width: 'auto' }} value={s.stageId ?? ''} onChange={(ev) => set({ stageId: ev.target.value, page: 1 })} placeholder="Any stage" options={(stages ?? []).filter((st) => st.active).map((st) => ({ value: st.id, label: `${st.label} (${st.leadCount})` }))} />
          {can('enquiry.view', 'TEAM') && <Select className="sm" style={{ width: 'auto' }} value={s.assignedTo ?? ''} onChange={(ev) => set({ assignedTo: ev.target.value, page: 1 })} placeholder="Any owner" options={[{ value: 'me', label: 'Me' }, { value: 'none', label: 'Unassigned' }, ...(team ?? []).map((t) => ({ value: t.id, label: t.name }))]} />}
          <Select className="sm" style={{ width: 'auto' }} value={s.temperature ?? ''} onChange={(ev) => set({ temperature: ev.target.value, page: 1 })} placeholder="Any temperature" options={(['HOT', 'WARM', 'COLD'] as const).map((t) => ({ value: t, label: TEMPERATURE_LABEL[t] }))} />
          <Button size="sm" icon={<Filter size={14} />} variant={activeFilters.length ? 'primary' : 'default'} onClick={() => setFiltersOpen(true)}>Filters{activeFilters.length ? ` (${activeFilters.length})` : ''}</Button>
          <span className="spacer" />
          <Select className="sm" style={{ width: 'auto' }} value={s.sort ?? ''} onChange={(ev) => set({ sort: ev.target.value, page: 1 })} options={[{ value: '', label: 'Newest first' }, { value: 'score', label: 'Highest score' }, { value: 'followUp', label: 'Next follow-up' }, { value: 'lastActivity', label: 'Recent activity' }, { value: 'oldest', label: 'Oldest first' }, { value: 'name', label: 'Name A–Z' }]} />
          <Menu
            trigger={(toggle) => <Button size="sm" icon={<Bookmark size={14} />} onClick={toggle}>Views</Button>}
          >
            {(close) => (
              <>
                {(views ?? []).length === 0 && <div className="muted small" style={{ padding: 10 }}>No saved views yet.</div>}
                {(views ?? []).map((v) => (
                  <div key={v.id} className="row" style={{ gap: 4 }}>
                    <button type="button" onClick={() => { applyView(v); close(); }}>{v.name}{v.shared && <Badge tone="sky" plain>team</Badge>}</button>
                    {v.userId === user?.id && <button type="button" aria-label={`Delete ${v.name}`} style={{ width: 'auto' }} onClick={async () => { await del(`/admin/crm/views/${v.id}`); invalidate('crm:views'); }}><Trash2 size={13} /></button>}
                  </div>
                ))}
                <hr />
                <button type="button" onClick={() => { setSaving(true); close(); }}><Bookmark size={14} /> Save current view…</button>
              </>
            )}
          </Menu>
        </div>

        {activeFilters.length > 0 && (
          <div className="filter-chips">
            {activeFilters.map((k) => (
              <button key={k} type="button" className="filter-chip" onClick={() => set({ [k]: null, page: 1 })}>
                {humanise(k)}: <strong>{k === 'stageId' ? stages?.find((st) => st.id === s[k])?.label : k === 'assignedTo' ? (s[k] === 'me' ? 'Me' : s[k] === 'none' ? 'Unassigned' : team?.find((t) => t.id === s[k])?.name) : k === 'typologyId' ? types?.find((t) => t.id === s[k])?.name : k === 'leadSource' ? LEAD_SOURCE_LABEL[s[k] as LeadSourceValue] : s[k]}</strong> <X size={12} />
              </button>
            ))}
            <button type="button" className="link-button small" onClick={() => set({ ...Object.fromEntries(FILTER_KEYS.map((k) => [k, null])), page: 1 })}>Clear all</button>
          </div>
        )}

        {editable && selected.size > 0 && (
          <div className="bulk-bar">
            <CheckSquare size={16} /> <strong>{selected.size} selected</strong>
            {can('enquiry.assign') && <Select className="sm" style={{ width: 'auto' }} value="" onChange={(ev) => ev.target.value && void bulk({ action: 'assign', assignedToId: ev.target.value === 'none' ? null : ev.target.value }, 'Leads assigned.')} placeholder="Assign to…" options={[{ value: 'none', label: 'Nobody' }, ...(team ?? []).map((t) => ({ value: t.id, label: t.name }))]} />}
            <Select className="sm" style={{ width: 'auto' }} value="" onChange={(ev) => { const st = stages?.find((x) => x.id === ev.target.value); if (!st) return; if (st.category === 'LOST') setBulkLost(true); else void bulk({ action: 'stage', stageId: st.id }, `Moved to ${st.label}.`); }} placeholder="Move to…" options={(stages ?? []).filter((st) => st.active && st.category !== 'SPAM').map((st) => ({ value: st.id, label: st.label }))} />
            <Button size="sm" icon={<Tag size={14} />} onClick={() => { const t = window.prompt('Tag to add'); if (t?.trim()) void bulk({ action: 'tag', tags: [t.trim()] }, `Tagged “${t.trim()}”.`); }}>Tag</Button>
            {can('enquiry.archive') && <Button size="sm" icon={<Archive size={14} />} onClick={() => void bulk({ action: s.view === 'archived' ? 'restore' : 'archive' }, s.view === 'archived' ? 'Restored.' : 'Archived.')}>{s.view === 'archived' ? 'Restore' : 'Archive'}</Button>}
            <Button size="sm" variant="ghost" icon={<ShieldAlert size={14} />} onClick={() => void bulk({ action: 'spam' }, 'Marked as spam.')}>Spam</Button>
            <span className="spacer" />
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}

        {error && <ErrorBox error={error} onRetry={refetch} />}
        {!data && !error && <div className="card-body"><Skeleton h={48} /><div style={{ height: 8 }} /><Skeleton h={48} /><div style={{ height: 8 }} /><Skeleton h={48} /></div>}
        {data && rows.length === 0 && (
          <Empty title={s.q || activeFilters.length ? 'No leads match' : 'No leads here yet'} icon={<Inbox size={32} />} action={editable && !s.q ? <Button variant="primary" icon={<Plus size={15} />} onClick={() => setAdding(true)}>Add a lead</Button> : undefined}>
            {s.q || activeFilters.length ? 'Try a shorter search, or clear a filter.' : 'Website enquiries arrive here on their own. Add a call or walk-in by hand.'}
          </Empty>
        )}
        {rows.length > 0 && (
          <div className="table-wrap">
            <table className="table lead-table crm-cards">
              <thead>
                <tr>
                  {editable && <th className="check"><Checkbox checked={allChecked} aria-label="Select all" onChange={(v) => setSelected(v ? new Set(rows.map((r) => r.id)) : new Set())} /></th>}
                  <th>Lead</th>
                  <th>Interest</th>
                  <th>Stage</th>
                  <th className="num">Score</th>
                  <th>Owner</th>
                  <th>Next action</th>
                  <th>Last contact</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const unit = r.primaryUnit ?? r.units[0];
                  const next = r.nextTask;
                  return (
                    <tr key={r.id} data-overdue={r.overdue ? 'true' : undefined} data-clickable="true" data-selected={selected.has(r.id) ? 'true' : undefined} onClick={() => navigate(`/crm/leads/${r.id}`)}>
                      {editable && <td className="check" onClick={(e) => e.stopPropagation()}><Checkbox checked={selected.has(r.id)} aria-label={`Select ${r.name}`} onChange={(v) => { const n = new Set(selected); if (v) n.add(r.id); else n.delete(r.id); setSelected(n); }} /></td>}
                      <td data-label="Lead">
                        <div className="lead-cell">
                          <strong>{r.name}</strong>
                          <TempBadge temp={r.effectiveTemperature} compact />
                          <PriorityBadge priority={r.priority} />
                        </div>
                        <div className="muted small">{LEAD_SOURCE_LABEL[r.leadSource as LeadSourceValue]}{r.city ? ` · ${r.city}` : ''}{r.repeatCount ? ` · asked ×${r.repeatCount + 1}` : ''} · {ago(r.createdAt)}</div>
                      </td>
                      <td data-label="Interest" className="small">
                        {unit ? <><strong>{fmtCode(unit.code)}</strong> · {unit.typology.name}<div className="muted">{Math.round(unit.areaSqm)} m² · {money(unit.priceMinor, unit.currency, { compact: true })}</div></> : r.typology || r.bedrooms ? <>{r.typology?.name ?? `${r.bedrooms} bed`}<div className="muted">{r.budgetMaxMinor ? `≤ ${money(r.budgetMaxMinor, 'USD', { compact: true })}` : 'Budget unknown'}</div></> : <span className="faint">Not yet known</span>}
                      </td>
                      <td data-label="Stage">{r.stage ? <StageBadge label={r.stage.label} color={r.stage.color} /> : <Badge tone="grey">{humanise(r.status)}</Badge>}</td>
                      <td data-label="Score" className="num"><ScorePill score={r.score} /></td>
                      <td data-label="Owner"><span className="row" style={{ gap: 6 }}><Avatar name={r.assignedToName} size={24} /><span className="small">{r.assignedToName ?? <span className="faint">Unassigned</span>}</span></span></td>
                      <td data-label="Next action" className="small">
                        {next ? <><span className={isPast(next.dueAt) ? 'text-red' : ''}>{next.dueAt ? relDay(next.dueAt) : 'No date'}</span><div className="muted ellipsis">{next.title}</div></> : r.overdue ? <Badge tone="red" plain>First reply overdue</Badge> : ['SOLD', 'LOST', 'DISQUALIFIED', 'SPAM'].includes(r.status) ? <span className="faint">—</span> : <span className="text-amber"><AlarmClock size={12} /> No next step</span>}
                      </td>
                      <td data-label="Last contact" className="small muted">{r.lastContactAt ? ago(r.lastContactAt) : 'Never'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && data.meta.pages > 1 && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(p) => set({ page: p })} />}
      </Card>

      {filtersOpen && <FiltersModal values={s} onApply={(v) => { set({ ...v, page: 1 }); setFiltersOpen(false); }} onClose={() => setFiltersOpen(false)} />}
      {saving && <SaveViewModal filters={Object.fromEntries([...FILTER_KEYS, 'view', 'sort', 'q'].filter((k) => s[k]).map((k) => [k, s[k]!]))} onClose={() => setSaving(false)} />}
      {adding && <NewLeadModal onClose={() => setAdding(false)} />}
      {bulkLost && <LostModal count={selected.size} onClose={() => setBulkLost(false)} onConfirm={(reason) => { setBulkLost(false); void bulk({ action: 'status', status: 'LOST', lostReason: reason }, 'Marked as lost.'); }} />}
    </>
  );
}

function FiltersModal({ values, onApply, onClose }: { values: Record<string, string>; onApply: (v: Record<string, string | null>) => void; onClose: () => void }) {
  const { data: types } = useTypes();
  const { data: campaigns } = useQuery('crm:campaigns', () => get<{ id: string; name: string }[]>('/admin/crm/campaigns'));
  const [d, setD] = useState<Record<string, string>>(Object.fromEntries(FILTER_KEYS.map((k) => [k, values[k] ?? ''])));
  const f = (k: string) => ({ value: d[k] ?? '', onChange: (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value }) });
  return (
    <Modal title="Filter leads" onClose={onClose} footer={<><Button onClick={() => onApply(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))}>Clear all</Button><span className="spacer" /><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => onApply(Object.fromEntries(FILTER_KEYS.map((k) => [k, d[k] || null])))}>Apply</Button></>}>
      <div className="grid-2">
        <Field label="Source"><Select {...f('leadSource')} placeholder="Any" options={LEAD_SOURCES.map((x) => ({ value: x, label: LEAD_SOURCE_LABEL[x] }))} /></Field>
        <Field label="Campaign"><Select {...f('campaignId')} placeholder="Any" options={(campaigns ?? []).map((c) => ({ value: c.id, label: c.name }))} /></Field>
        <Field label="Residence type"><Select {...f('typologyId')} placeholder="Any" options={(types ?? []).map((t) => ({ value: t.id, label: t.name }))} /></Field>
        <Field label="Bedrooms"><Select {...f('bedrooms')} placeholder="Any" options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))} /></Field>
        <Field label="Budget from ($)"><Input inputMode="numeric" {...f('budgetMin')} /></Field>
        <Field label="Budget up to ($)"><Input inputMode="numeric" {...f('budgetMax')} /></Field>
        <Field label="Created from"><Input type="date" {...f('createdFrom')} /></Field>
        <Field label="Created to"><Input type="date" {...f('createdTo')} /></Field>
        <Field label="Next follow-up"><Select {...f('followUp')} placeholder="Any" options={[{ value: 'overdue', label: 'Overdue' }, { value: 'today', label: 'Today' }, { value: 'week', label: 'Next 7 days' }, { value: 'none', label: 'None set' }]} /></Field>
        <Field label="Last activity"><Select {...f('lastActivity')} placeholder="Any" options={[{ value: '7d', label: 'In the last 7 days' }, { value: 'stale', label: 'Quiet for 14+ days' }]} /></Field>
        <Field label="Priority"><Select {...f('priority')} placeholder="Any" options={['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((p) => ({ value: p, label: humanise(p) }))} /></Field>
        <Field label="Tag"><Input {...f('tag')} placeholder="investor" /></Field>
      </div>
    </Modal>
  );
}

function SaveViewModal({ filters, onClose }: { filters: Record<string, string>; onClose: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const save = async () => {
    try {
      await post('/admin/crm/views', { scope: 'leads', name, filters, shared });
      toast.success('View saved.');
      invalidate('crm:views');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Modal title="Save this view" sub={`${Object.keys(filters).length} filter${Object.keys(filters).length === 1 ? '' : 's'} and the sort order`} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!name.trim()} onClick={() => void save()}>Save</Button></>}>
      <Field label="Name"><Input autoFocus value={name} placeholder="Hot diaspora investors" onChange={(e) => setName(e.target.value)} /></Field>
      {can('enquiry.view', 'ALL') && <Checkbox checked={shared} onChange={setShared} label="Share with the team" />}
    </Modal>
  );
}
