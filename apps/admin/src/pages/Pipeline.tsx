import { useDeferredValue, useMemo, useState, type DragEvent } from 'react';
import { AlarmClock, CalendarCheck, Eye, EyeOff, KanbanSquare, List, MessageSquare, Phone, Plus, Search, Settings2 } from 'lucide-react';
import { LEAD_SOURCE_LABEL, LEAD_SOURCES, TEMPERATURE_LABEL, type LeadSourceValue } from '@avida/types';
import { get, patch, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { isPast, refreshCrm, relDay, type LeadRow, type Stage } from '../lib/crm';
import { code as fmtCode, money } from '../lib/format';
import { useQuery } from '../lib/query';
import { useTeam } from '../lib/ref';
import { Link, navigate, useSearchState } from '../lib/router';
import { useToast } from '../components/Toast';
import { Avatar, LostModal, NewLeadModal, ScorePill, TempBadge } from '../components/crm';
import { Button, Empty, ErrorBox, Input, PageHead, Select, Skeleton, useConfirm } from '../components/ui';

type BoardStage = Stage & { closed: boolean; count: number; valueMinor: number; weightedMinor: number };
type Card = LeadRow & { stageId: string | null };
interface Board {
  stages: BoardStage[];
  leads: Card[];
  truncated: boolean;
}

/** Moves that change the sales record deserve a second look before they happen. */
const CONFIRM: Record<string, string> = {
  RESERVED: 'Reserving is normally done from a deal, which also holds the residence on the website. Move the lead to Reserved anyway?',
  CONTRACT: 'Contracts are normally tracked on the deal. Move the lead to Contract anyway?',
  SOLD: 'Closing a sale from a deal also marks the residence sold. Mark only the lead as sold?',
  DISQUALIFIED: 'Disqualified leads leave the active pipeline. Continue?',
};

/** The sales pipeline as a board: drag a card to move a lead, click it to work it. */
export default function Pipeline() {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: team } = useTeam();
  const [s, set] = useSearchState();
  const [search, setSearch] = useState('');
  const term = useDeferredValue(search.trim().toLowerCase());
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [lost, setLost] = useState<{ card: Card; stage: BoardStage } | null>(null);
  const [adding, setAdding] = useState(false);
  const showClosed = s.closed === '1';

  const query = qs({ assignedTo: s.assignedTo, leadSource: s.leadSource, temperature: s.temperature, view: s.overdue ? 'overdue' : undefined });
  const { data, error, refetch } = useQuery(`crm:board:${query}`, () => get<Board>(`/admin/enquiries/board${query}`));

  const cards = useMemo(() => {
    return (data?.leads ?? [])
      .map((c) => (overrides[c.id] ? { ...c, stageId: overrides[c.id]! } : c))
      .filter((c) => !term || `${c.name} ${c.phone ?? ''} ${c.email ?? ''} ${c.units.map((u) => u.code).join(' ')} ${c.tags.join(' ')}`.toLowerCase().includes(term));
  }, [data, overrides, term]);
  const columns = (data?.stages ?? []).filter((st) => showClosed || !st.closed);
  const editable = can('enquiry.edit');

  const commit = async (card: Card, stage: BoardStage, extra: Record<string, unknown> = {}) => {
    const from = card.stageId;
    const fromLabel = data?.stages.find((x) => x.id === from)?.label;
    setOverrides((o) => ({ ...o, [card.id]: stage.id }));
    try {
      await patch(`/admin/enquiries/${card.id}`, { stageId: stage.id, ...extra });
      toast.success(`${card.name} → ${stage.label}`, from ? { label: 'Undo', onClick: () => void undo(card, from, fromLabel) } : undefined);
      refreshCrm();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOverrides((o) => {
        const n = { ...o };
        delete n[card.id];
        return n;
      });
    }
  };
  const undo = async (card: Card, stageId: string, label?: string) => {
    try {
      await patch(`/admin/enquiries/${card.id}`, { stageId });
      toast.success(`${card.name} back to ${label ?? 'the previous stage'}.`);
      refreshCrm();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const move = async (card: Card, stage: BoardStage) => {
    if (card.stageId === stage.id) return;
    if (stage.category === 'LOST') return setLost({ card, stage });
    const question = CONFIRM[stage.category];
    if (question && !(await confirm({ title: `Move ${card.name} to ${stage.label}?`, body: question, confirm: 'Move' }))) return;
    await commit(card, stage);
  };

  const onDrop = (e: DragEvent, stage: BoardStage) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData('text/plain');
    const card = cards.find((c) => c.id === id);
    setDragging(null);
    if (card) void move(card, stage);
  };

  return (
    <>
      <PageHead title="Pipeline" sub={data ? `${cards.filter((c) => !data.stages.find((st) => st.id === c.stageId)?.closed).length} open opportunities · ${money(data.stages.filter((st) => !st.closed).reduce((a, st) => a + st.valueMinor, 0), 'USD', { compact: true })} in play · ${money(data.stages.filter((st) => !st.closed).reduce((a, st) => a + st.weightedMinor, 0), 'USD', { compact: true })} weighted` : 'Every opportunity, stage by stage'}>
        <Link className="btn" to="/enquiries"><List size={15} /> List</Link>
        {can('crm.configure') && <Link className="btn" to="/crm/settings"><Settings2 size={15} /> Stages</Link>}
        {editable && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAdding(true)}>New lead</Button>}
      </PageHead>

      <div className="board-toolbar" aria-label="Pipeline filters">
        <label className="crm-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search the board</span><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, residence, tag" /></label>
        {can('enquiry.view-all') && <Select className="sm" value={s.assignedTo ?? ''} onChange={(e) => set({ assignedTo: e.target.value })} placeholder="Everyone" options={[{ value: 'me', label: 'Mine' }, { value: 'none', label: 'Unassigned' }, ...(team ?? []).map((m) => ({ value: m.id, label: m.name }))]} />}
        <Select className="sm" value={s.leadSource ?? ''} onChange={(e) => set({ leadSource: e.target.value })} placeholder="All sources" options={LEAD_SOURCES.map((x) => ({ value: x, label: LEAD_SOURCE_LABEL[x] }))} />
        <Select className="sm" value={s.temperature ?? ''} onChange={(e) => set({ temperature: e.target.value })} placeholder="Any temperature" options={(['HOT', 'WARM', 'COLD'] as const).map((t) => ({ value: t, label: TEMPERATURE_LABEL[t] }))} />
        <Button size="sm" variant={s.overdue ? 'primary' : 'default'} icon={<AlarmClock size={14} />} onClick={() => set({ overdue: s.overdue ? null : '1' })}>Overdue</Button>
        <Button size="sm" variant="ghost" icon={showClosed ? <EyeOff size={14} /> : <Eye size={14} />} onClick={() => set({ closed: showClosed ? null : '1' })}>{showClosed ? 'Hide closed' : 'Show sold & lost'}</Button>
      </div>

      {error && <ErrorBox error={error} onRetry={refetch} />}
      {!data && !error && <div className="board">{Array.from({ length: 5 }, (_, i) => <div key={i} className="board-col"><Skeleton h={420} /></div>)}</div>}
      {data && (
        <div className="board" aria-label="Lead pipeline board">
          {columns.map((stage) => {
            const inCol = cards.filter((c) => c.stageId === stage.id);
            return (
              <section
                key={stage.id}
                className={`board-col ${over === stage.id ? 'is-over' : ''} ${stage.closed ? 'is-closed' : ''}`}
                aria-labelledby={`col-${stage.id}`}
                onDragOver={(e) => { if (dragging) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (over !== stage.id) setOver(stage.id); } }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
                onDrop={(e) => onDrop(e, stage)}
              >
                <header className="board-col-head">
                  <span className={`dot tone-${stage.color}`} aria-hidden="true" />
                  <h2 id={`col-${stage.id}`}>{stage.label}</h2>
                  <span className="col-count tabular">{inCol.length}</span>
                  <div className="col-value tabular" title={`${stage.probability}% win probability · ${money(stage.weightedMinor, 'USD')} weighted`}>{stage.valueMinor ? money(inCol.reduce((a, c) => a + c.valueMinor, 0), 'USD', { compact: true }) : '—'}{stage.closed ? ' · last 30 days' : ''}</div>
                </header>
                <div className="board-col-body">
                  {inCol.map((c) => (
                    <LeadCard key={c.id} card={c} stages={data.stages} draggable={editable} dragging={dragging === c.id} onDragStart={() => setDragging(c.id)} onDragEnd={() => { setDragging(null); setOver(null); }} onMove={(st) => void move(c, st)} />
                  ))}
                  {inCol.length === 0 && <Empty title={dragging ? 'Drop here' : 'No leads'} icon={<KanbanSquare size={22} />} />}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {data?.truncated && <p className="muted small">Showing the first 1,500 leads. Filter to see the rest.</p>}
      {lost && <LostModal onClose={() => setLost(null)} onConfirm={(reason, note) => { const l = lost; setLost(null); void commit(l.card, l.stage, { lostReason: reason, lostNote: note || null }); }} />}
      {adding && <NewLeadModal onClose={() => setAdding(false)} />}
    </>
  );
}

function LeadCard({ card: c, stages, draggable, dragging, onDragStart, onDragEnd, onMove }: { card: Card; stages: BoardStage[]; draggable: boolean; dragging: boolean; onDragStart: () => void; onDragEnd: () => void; onMove: (st: BoardStage) => void }) {
  const unit = c.primaryUnit ?? c.units[0];
  const next = c.nextTask;
  const overdue = c.overdue || isPast(next?.dueAt);
  return (
    <article
      className={`lead-card ${overdue ? 'is-overdue' : ''} ${dragging ? 'is-dragging' : ''}`}
      draggable={draggable}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragEnd={onDragEnd}
    >
      <button type="button" className="lead-card-open" onClick={() => navigate(`/crm/leads/${c.id}`)}>
        <span className="lc-head">
          <strong>{c.name}</strong>
          <TempBadge temp={c.effectiveTemperature} compact />
          <ScorePill score={c.score} />
        </span>
        {unit ? (
          <span className="lc-unit">{unit.typology.name} · <strong>{fmtCode(unit.code)}</strong><span>{Math.round(unit.areaSqm)} m² · {money(unit.priceMinor, unit.currency, { compact: true })}</span></span>
        ) : (
          <span className="lc-unit muted">{c.typology?.name ?? (c.bedrooms ? `${c.bedrooms} bedroom` : 'Requirements not captured')}</span>
        )}
        {c.budgetMaxMinor !== null && <span className="lc-line">Budget {money(c.budgetMaxMinor, 'USD', { compact: true })}{c.openDeal ? ` · deal ${c.openDeal.status.toLowerCase()}` : ''}</span>}
        {c.openViewing && <span className="lc-line lc-viewing"><CalendarCheck size={12} /> Viewing {c.openViewing.scheduledAt ? relDay(c.openViewing.scheduledAt) : 'requested'}</span>}
        <span className={`lc-line ${overdue ? 'text-red' : ''}`}><AlarmClock size={12} /> {next ? `${next.dueAt ? relDay(next.dueAt) : 'No date'} · ${next.title}` : c.overdue ? 'First reply overdue' : 'No next step'}</span>
        <span className="lc-foot">
          <Avatar name={c.assignedToName} size={20} />
          <span className="muted">{c.assignedToName?.split(' ')[0] ?? 'Unassigned'}</span>
          <span className="spacer" />
          <span className="muted" title="Activities"><MessageSquare size={11} /> {c.noteCount}</span>
          <span className="muted">{c.lastContactAt ? relDay(c.lastContactAt, false) : 'no contact'}</span>
        </span>
        {c.tags.length > 0 && <span className="lc-tags">{c.tags.slice(0, 3).map((t) => <span key={t}>#{t}</span>)}</span>}
      </button>
      <div className="lc-actions">
        {c.phone && <a href={`tel:${c.phone}`} aria-label={`Call ${c.name}`} title={c.phone}><Phone size={13} /></a>}
        {draggable && (
          <label>
            <span className="sr-only">Move {c.name} to stage</span>
            <select value={c.stageId ?? ''} onChange={(e) => { const st = stages.find((x) => x.id === e.target.value); if (st) onMove(st); }}>
              {stages.map((st) => <option key={st.id} value={st.id}>{st.label}</option>)}
            </select>
          </label>
        )}
        <span className="muted small">{LEAD_SOURCE_LABEL[c.leadSource as LeadSourceValue]}</span>
      </div>
    </article>
  );
}
