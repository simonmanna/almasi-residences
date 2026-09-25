import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlarmClock,
  AlertTriangle,
  Archive,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarCheck,
  CalendarPlus,
  Check,
  ChevronDown,
  CircleDot,
  Copy,
  FileText,
  Handshake,
  KeyRound,
  ListTodo,
  Mail,
  MessageCircle,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Phone,
  Pin,
  ShieldAlert,
  Sparkles,
  StickyNote,
  Upload,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  CONTACT_METHOD_LABEL,
  CONTACT_METHODS,
  CRM_PRIORITIES,
  DOCUMENT_KIND_LABEL,
  DOCUMENT_KINDS,
  humanise,
  LEAD_NOTE_KINDS,
  LEAD_NOTE_LABEL,
  LEAD_PURPOSE_LABEL,
  LEAD_PURPOSES,
  LEAD_SOURCE_LABEL,
  LEAD_SOURCES,
  LOST_REASON_LABEL,
  NOTIFICATION_KIND_LABEL,
  PRIORITY_LABEL,
  PURCHASE_TIMELINE_LABEL,
  PURCHASE_TIMELINES,
  STAGE_LABEL,
  TEMPERATURE_LABEL,
  VIEWING_INTEREST_LABEL,
  VIEWING_STATUS_LABEL,
  type LeadSourceValue,
  type LostReasonValue,
  type ViewingStatusValue,
} from '@avida/types';
import { del, downloadUrl, get, patch, post, upload } from '../lib/api';
import { useAuth } from '../lib/auth';
import { isPast, localDateTime, presetDue, refreshCrm, relDay, type Activity, type Deal, type LeadRow, type Stage, type Task, type UnitCard } from '../lib/crm';
import { ago, bytes, code as fmtCode, date, dateTime, money } from '../lib/format';
import { useQuery } from '../lib/query';
import { useTeam, useTypes } from '../lib/ref';
import { Link, navigate, useSearchState } from '../lib/router';
import { useToast } from '../components/Toast';
import {
  Avatar,
  ContactActions,
  DealModal,
  DuePresets,
  DuplicateList,
  LostModal,
  PriorityBadge,
  ScorePill,
  StageBadge,
  TaskModal,
  TaskRow,
  TempBadge,
  UnitChip,
  UnitPicker,
  ViewingFeedbackModal,
} from '../components/crm';
import { Alert, Badge, Button, Card, Checkbox, Empty, ErrorBox, Field, Input, KV, Menu, Modal, MoneyInput, PageHead, Select, Skeleton, Tabs, Textarea, useConfirm } from '../components/ui';
import { DealPanel } from './Deals';
import { ViewingForm } from './Viewings';

interface LeadDetail extends LeadRow {
  message: string | null;
  preferredContact: string | null;
  sizeMinSqm: number | null;
  sizeMaxSqm: number | null;
  floorPreference: string | null;
  purpose: string | null;
  financingRequired: boolean | null;
  budgetConfirmed: boolean;
  timeline: string | null;
  decisionMaker: string | null;
  lostReason: string | null;
  lostNote: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  landingPath: string | null;
  source: string | null;
  typologyId: string | null;
  createdBy: { id: string; name: string } | null;
  buyer: { id: string; fullName: string; stage?: string } | null;
  scoreItems: { key: string; label: string; points: number }[];
  daysInStage: number;
  notes: Activity[];
  tasks: Task[];
  viewings: { id: string; status: string; scheduledAt: string | null; requestedDate: string | null; interestLevel: string | null; outcome: string | null; objections: string | null; agent: { id: string; name: string } | null; units: { id: string; code: string }[]; alternativeUnit: { id: string; code: string } | null }[];
  reservations: { id: string; status: string; heldUntil: string; depositMinor: number | null; unit: { id: string; code: string } }[];
  deals: Deal[];
  documents: { id: string; kind: string; name: string; mimeType: string | null; sizeBytes: number | null; sentAt: string | null; createdAt: string; hasFile: boolean; uploadedBy: { name: string } | null }[];
  documentsHidden: boolean;
  stageHistory: { id: string; fromLabel: string | null; toLabel: string | null; createdAt: string; hours: number }[];
  notifications: { id: string; kind: string; recipient: string; status: string; lastError: string | null; sentAt: string | null; createdAt: string }[];
  duplicates: { id: string; name: string; email: string | null; phone: string | null; stage: string; owner: string | null; createdAt: string; reasons: string[]; strong: boolean; canOpen: boolean }[];
  similar: (UnitCard & { reasons: string[] })[];
  unavailableInterest: UnitCard[];
  stages: Stage[];
}

const KIND_ICON: Record<string, typeof Phone> = { CALL: Phone, WHATSAPP: MessageCircle, EMAIL: Mail, SMS: MessageSquareText, MEETING: Users, NOTE: StickyNote, VIEWING: CalendarCheck, DOCUMENT: FileText, TASK: ListTodo, ASSIGNMENT: UserCheck, RESERVATION: KeyRound, DEAL: Handshake, STATUS: CircleDot, SYSTEM: Sparkles };
const TABS = ['activity', 'tasks', 'viewings', 'deals', 'documents', 'history'] as const;
type Tab = (typeof TABS)[number];

/** The lead's workspace: who they are, what they want, everything that happened, and what happens next. */
export default function LeadDetail({ params }: { params: Record<string, string> }) {
  const id = params.id!;
  const { can, user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: team } = useTeam();
  const [s, set] = useSearchState({ tab: 'activity' });
  const tab = (TABS as readonly string[]).includes(s.tab!) ? (s.tab as Tab) : 'activity';
  const { data: lead, error, refetch } = useQuery(`enquiries:detail:${id}`, () => get<LeadDetail>(`/admin/enquiries/${id}`));
  const [kind, setKind] = useState<string>('CALL');
  const [modal, setModal] = useState<null | 'task' | 'viewing' | 'deal' | 'edit' | 'lost' | 'merge'>(null);
  const [feedbackFor, setFeedbackFor] = useState<LeadDetail['viewings'][number] | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const editable = can('enquiry.edit');

  const update = async (payload: Record<string, unknown>, msg = 'Saved.') => {
    try {
      await patch(`/admin/enquiries/${id}`, payload);
      toast.success(msg);
      refreshCrm();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };
  const logFor = (k: string) => {
    setKind(k);
    set({ tab: 'activity' });
    setTimeout(() => composer.current?.focus(), 50);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      if (typing || e.metaKey || e.ctrlKey || e.altKey || !editable) return;
      if (e.key === 'n') (e.preventDefault(), logFor('NOTE'));
      if (e.key === 'c') (e.preventDefault(), logFor('CALL'));
      if (e.key === 't') (e.preventDefault(), setModal('task'));
      if (e.key === 'v') (e.preventDefault(), setModal('viewing'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable]);

  if (error) return <><PageHead title="Lead" crumbs={[{ label: 'CRM', to: '/crm' }, { label: 'Leads and Enquiries', to: '/enquiries' }]} /><ErrorBox error={error} onRetry={refetch} /></>;
  if (!lead) return <div className="stack"><Skeleton h={140} /><div className="lead-grid"><Skeleton h={420} /><Skeleton h={420} /><Skeleton h={420} /></div></div>;

  const unit = lead.primaryUnit ?? lead.units[0] ?? null;
  const openTasks = lead.tasks.filter((t) => t.status === 'OPEN');
  const nextTask = openTasks[0] ?? null;
  const closed = ['SOLD', 'LOST', 'DISQUALIFIED', 'SPAM'].includes(lead.status);
  const pipeline = lead.stages.filter((st) => !['ON_HOLD', 'LOST', 'DISQUALIFIED', 'SPAM'].includes(st.category));
  const exits = lead.stages.filter((st) => ['ON_HOLD', 'LOST', 'DISQUALIFIED'].includes(st.category));
  const currentIndex = pipeline.findIndex((st) => st.id === lead.stage?.id);
  const openDeals = lead.deals.filter((d) => ['NEGOTIATION', 'RESERVED', 'CONTRACT'].includes(d.status));
  const canTake = !lead.assignedToId && editable;
  // A residence held by this lead's own deal is not "lost" to them.
  const lostInterest = lead.unavailableInterest.filter((u) => !openDeals.some((d) => d.unit.id === u.id));

  const moveTo = async (st: Stage) => {
    if (st.id === lead.stage?.id) return;
    if (st.category === 'LOST') return setModal('lost');
    if (['SOLD', 'RESERVED', 'CONTRACT', 'DISQUALIFIED'].includes(st.category) && !(await confirm({ title: `Move to ${st.label}?`, body: st.category === 'SOLD' ? 'To sell the residence too, use “Mark sold” on the deal.' : st.category === 'RESERVED' ? 'To hold the residence on the website, reserve it from a deal.' : 'This changes the lead’s stage.', confirm: 'Move' }))) return;
    const from = lead.stage;
    try {
      await patch(`/admin/enquiries/${id}`, { stageId: st.id });
      toast.success(`Moved to ${st.label}.`, from ? { label: 'Undo', onClick: () => void update({ stageId: from.id }, `Back to ${from.label}.`) } : undefined);
      refreshCrm();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <>
      <PageHead
        crumbs={[{ label: 'CRM', to: '/crm' }, { label: 'Leads and Enquiries', to: '/enquiries' }, { label: lead.name }]}
        title={
          <span className="lead-title">
            {lead.name}
            <TempBadge temp={lead.effectiveTemperature} />
            <PriorityBadge priority={lead.priority} />
          </span>
        }
        sub={
          <span className="lead-sub">
            {lead.stage && <StageBadge label={lead.stage.label} color={lead.stage.color} />}
            <span>{LEAD_SOURCE_LABEL[lead.leadSource as LeadSourceValue]}{lead.campaign ? ` · ${lead.campaign.name}` : ''}</span>
            <span>Created {ago(lead.createdAt)}{lead.createdBy ? ` by ${lead.createdBy.name}` : ''}</span>
            <span>{lead.daysInStage} day{lead.daysInStage === 1 ? '' : 's'} in stage</span>
          </span>
        }
      >
        <div className="owner-pick">
          <Avatar name={lead.assignedToName} size={30} />
          {can('enquiry.assign') ? (
            <Select className="sm" value={lead.assignedToId ?? ''} onChange={(e) => void update({ assignedToId: e.target.value || null }, e.target.value ? 'Owner changed — they have been notified.' : 'Returned to the unassigned pool.')} placeholder="Unassigned" options={(team ?? []).map((t) => ({ value: t.id, label: t.name }))} />
          ) : canTake ? (
            <Button size="sm" variant="primary" onClick={() => void update({ assignedToId: user!.id }, 'The lead is yours.')}>Take this lead</Button>
          ) : (
            <span className="small">{lead.assignedToName ?? 'Unassigned'}</span>
          )}
        </div>
      </PageHead>

      {/* ── Property + actions ─────────────────────────────────── */}
      <Card className="lead-hero">
        <div className="lead-hero-main">
          <div className="lead-hero-unit">
            {unit ? (
              <>
                <span className="eyebrow">Interested in</span>
                <Link to={`/residences/${unit.id}`} className="hero-unit-code">{unit.typology.name} · {fmtCode(unit.code)}</Link>
                <span className="muted">{Math.round(unit.areaSqm)} m² · Floor {unit.floor.label} · {money(unit.priceMinor, unit.currency)} · <Badge tone={unit.status === 'AVAILABLE' ? 'green' : unit.status === 'SOLD' ? 'red' : 'orange'} plain>{unit.status.toLowerCase()}</Badge></span>
              </>
            ) : (
              <>
                <span className="eyebrow">Looking for</span>
                <span className="hero-unit-code">{lead.typology?.name ?? (lead.bedrooms ? `${lead.bedrooms}-bedroom residence` : 'Requirements not captured yet')}</span>
                <span className="muted">{lead.budgetMaxMinor ? `Budget up to ${money(lead.budgetMaxMinor, 'USD')}` : 'No budget recorded'}</span>
              </>
            )}
          </div>
          <div className="lead-hero-figs">
            <div><span>Score</span><ScorePill score={lead.score} /></div>
            <div><span>Budget</span><strong className="tabular">{lead.budgetMaxMinor ? money(lead.budgetMaxMinor, 'USD', { compact: true }) : '—'}</strong></div>
            <div><span>Value</span><strong className="tabular">{lead.valueMinor ? money(lead.valueMinor, 'USD', { compact: true }) : '—'}</strong></div>
            <div><span>Timeline</span><strong>{lead.timeline ? PURCHASE_TIMELINE_LABEL[lead.timeline as keyof typeof PURCHASE_TIMELINE_LABEL] : '—'}</strong></div>
          </div>
        </div>
        <div className="lead-actions">
          <ContactActions lead={lead} size="md" onContact={(k) => editable && logFor(k)} />
          {editable && (
            <div className="row-wrap">
              <Button icon={<CalendarPlus size={15} />} onClick={() => setModal('viewing')} title="Shortcut: V">Schedule viewing</Button>
              <Button icon={<ListTodo size={15} />} onClick={() => setModal('task')} title="Shortcut: T">Task</Button>
              <Button icon={<StickyNote size={15} />} onClick={() => logFor('NOTE')} title="Shortcut: N">Note</Button>
              {can('deal.edit') && !closed && <Button variant="primary" icon={<Handshake size={15} />} onClick={() => setModal('deal')}>Open deal</Button>}
              <Menu trigger={(toggle) => <Button icon={<MoreHorizontal size={16} />} aria-label="More actions" onClick={toggle} />}>
                {(close) => (
                  <>
                    <button type="button" onClick={() => { setModal('edit'); close(); }}><Pencil size={15} /> Edit details</button>
                    {!lead.buyer && can('buyer.edit') && <button type="button" onClick={async () => { close(); try { await post(`/admin/enquiries/${id}/convert`); toast.success('Contact record created.'); refreshCrm(); } catch (e) { toast.error((e as Error).message); } }}><UserCheck size={15} /> Make contact</button>}
                    {can('enquiry.merge') && <button type="button" onClick={() => { setModal('merge'); close(); }}><Copy size={15} /> Merge a duplicate…</button>}
                    <hr />
                    {exits.map((st) => <button key={st.id} type="button" onClick={() => { close(); void moveTo(st); }}><X size={15} /> {st.label}</button>)}
                    <button type="button" onClick={() => { close(); void update({ status: 'SPAM' }, 'Marked as spam.'); }}><ShieldAlert size={15} /> Spam</button>
                    {can('enquiry.archive') && <button type="button" className="danger" onClick={async () => { close(); if (await confirm({ title: `Archive ${lead.name}?`, body: 'Archived leads are hidden from every list but keep their history. You can restore them.', confirm: 'Archive', danger: true })) { try { await post(`/admin/enquiries/${id}/archive`); toast.success('Archived.'); refreshCrm(); navigate('/enquiries'); } catch (e) { toast.error((e as Error).message); } } }}><Archive size={15} /> Archive</button>}
                  </>
                )}
              </Menu>
            </div>
          )}
        </div>
        {/* Stage stepper */}
        <div className="stepper" role="group" aria-label="Pipeline stage">
          {pipeline.map((st, i) => (
            <button key={st.id} type="button" disabled={!editable} className={`${i < currentIndex ? 'done' : ''} ${st.id === lead.stage?.id ? 'current' : ''}`} onClick={() => void moveTo(st)} title={`Move to ${st.label}`}>
              {i < currentIndex ? <Check size={12} /> : null}
              <span>{st.label}</span>
            </button>
          ))}
          {currentIndex < 0 && lead.stage && <span className="stepper-exit"><StageBadge label={lead.stage.label} color={lead.stage.color} /></span>}
        </div>
      </Card>

      {/* ── Alerts ─────────────────────────────────────────────── */}
      <div className="stack-sm lead-alerts">
        {lead.overdue && <Alert tone="warn" icon={<AlarmClock size={18} />}>{lead.contactedAt ? 'The follow-up is overdue.' : 'No one has answered this lead yet — the website promises a reply within one working day.'}</Alert>}
        {lead.status === 'LOST' && lead.lostReason && <Alert tone="info">Lost — {LOST_REASON_LABEL[lead.lostReason as LostReasonValue]}{lead.lostNote ? `: ${lead.lostNote}` : ''}</Alert>}
        {lead.duplicates.some((d) => d.strong) && (
          <div className="alert warn" style={{ display: 'block' }}>
            <div className="row" style={{ marginBottom: 8, gap: 8 }}><AlertTriangle size={17} /><strong>Possible duplicate lead</strong><span className="muted small">Same phone or email as another lead.</span></div>
            <DuplicateList matches={lead.duplicates.filter((d) => d.strong)} onMerge={can('enquiry.merge') ? async (other) => { if (await confirm({ title: 'Merge into this lead?', body: 'The other lead’s history, tasks, viewings and deals move here, and it is archived. This cannot be undone automatically.', confirm: 'Merge' })) { try { await post(`/admin/enquiries/${id}/merge`, { otherId: other }); toast.success('Merged.'); refreshCrm(); } catch (e) { toast.error((e as Error).message); } } } : undefined} />
          </div>
        )}
        {lostInterest.length > 0 && lead.similar.length > 0 && !closed && (
          <Alert tone="info" icon={<Sparkles size={18} />}>{lostInterest.map((u) => fmtCode(u.code)).join(', ')} {lostInterest.length === 1 ? 'is' : 'are'} no longer available. {lead.similar.length} similar residence{lead.similar.length === 1 ? ' is' : 's are'} — see the right-hand panel.</Alert>
        )}
      </div>

      <div className="lead-grid">
        {/* ── Left: who they are ─────────────────────────────── */}
        <div className="stack lead-col-left">
          <Card>
            <div className="panel-head"><h3>Contact</h3>{editable && <Button size="xs" variant="ghost" icon={<Pencil size={13} />} onClick={() => setModal('edit')}>Edit</Button>}</div>
            <div className="card-body">
              <KV
                items={[
                  ['Phone', lead.phone ? <a href={`tel:${lead.phone}`}>{lead.phone}</a> : '—'],
                  ['WhatsApp', lead.whatsapp ?? (lead.phone ? 'Same as phone' : '—')],
                  ['Email', lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : '—'],
                  ['Location', [lead.city, lead.countryIso].filter(Boolean).join(', ') || '—'],
                  ['Prefers', lead.preferredContact ? CONTACT_METHOD_LABEL[lead.preferredContact as keyof typeof CONTACT_METHOD_LABEL] : '—'],
                  ['Contact record', lead.buyer ? <Link to={`/buyers/${lead.buyer.id}`}>{lead.buyer.fullName}</Link> : '—'],
                  ['First reply', lead.contactedAt ? `${dateTime(lead.contactedAt)}` : <Badge tone="amber">Not yet</Badge>],
                  ['Last contact', lead.lastContactAt ? ago(lead.lastContactAt) : 'Never'],
                ]}
              />
            </div>
          </Card>
          <Card>
            <div className="panel-head"><h3>Qualification</h3>{editable && <Button size="xs" variant="ghost" icon={<Pencil size={13} />} onClick={() => setModal('edit')}>Edit</Button>}</div>
            <div className="card-body">
              <KV
                items={[
                  ['Budget', lead.budgetMaxMinor ? `${lead.budgetMinMinor ? `${money(lead.budgetMinMinor, 'USD', { compact: true })} – ` : 'Up to '}${money(lead.budgetMaxMinor, 'USD')}` : '—'],
                  ['Budget confirmed', lead.budgetConfirmed ? <Badge tone="green" plain>Yes</Badge> : 'No'],
                  ['Financing', lead.financingRequired === null ? '—' : lead.financingRequired ? 'Needs financing' : 'Cash / own funds'],
                  ['Timeline', lead.timeline ? PURCHASE_TIMELINE_LABEL[lead.timeline as keyof typeof PURCHASE_TIMELINE_LABEL] : '—'],
                  ['Purpose', lead.purpose ? LEAD_PURPOSE_LABEL[lead.purpose as keyof typeof LEAD_PURPOSE_LABEL] : '—'],
                  ['Decision maker', lead.decisionMaker ?? '—'],
                  ['Type', lead.typology?.name ?? '—'],
                  ['Bedrooms', lead.bedrooms ?? '—'],
                  ['Size', lead.sizeMinSqm || lead.sizeMaxSqm ? `${lead.sizeMinSqm ?? '?'}–${lead.sizeMaxSqm ?? '?'} m²` : '—'],
                  ['Floor', lead.floorPreference ?? '—'],
                ]}
              />
            </div>
          </Card>
          {lead.message && (
            <Card>
              <div className="panel-head"><h3>Their message</h3></div>
              <div className="card-body"><p className="quote" style={{ margin: 0 }}>{lead.message}</p></div>
            </Card>
          )}
          <Card>
            <div className="panel-head"><h3>Source</h3></div>
            <div className="card-body">
              <KV items={[['Channel', LEAD_SOURCE_LABEL[lead.leadSource as LeadSourceValue]], ['Campaign', lead.campaign?.name ?? '—'], ['Placement', lead.source ?? '—'], ['UTM', lead.utmSource ? `${lead.utmSource}${lead.utmMedium ? ` / ${lead.utmMedium}` : ''}${lead.utmCampaign ? ` · ${lead.utmCampaign}` : ''}` : '—'], ['Landing page', lead.landingPath ?? '—']]} />
            </div>
          </Card>
        </div>

        {/* ── Centre: the work ───────────────────────────────── */}
        <div className="lead-col-main">
          <Card>
            <Tabs
              value={tab}
              onChange={(t) => set({ tab: t })}
              tabs={[
                { value: 'activity', label: 'Activity', count: lead.noteCount },
                { value: 'tasks', label: 'Tasks', count: openTasks.length },
                { value: 'viewings', label: 'Viewings', count: lead.viewings.length },
                { value: 'deals', label: 'Deals', count: lead.deals.length },
                { value: 'documents', label: 'Documents', count: lead.documents.length, hidden: !can('crm.documents') },
                { value: 'history', label: 'History' },
              ]}
            />
            <div className="card-body">
              {tab === 'activity' && (
                <>
                  {editable && <Composer leadId={id} kind={kind} setKind={setKind} inputRef={composer} />}
                  <Timeline notes={lead.notes} leadId={id} created={lead.createdAt} />
                </>
              )}
              {tab === 'tasks' && (
                <div className="stack-sm">
                  {editable && <Button icon={<ListTodo size={15} />} onClick={() => setModal('task')}>New task</Button>}
                  {lead.tasks.length === 0 && <Empty title="No tasks" icon={<ListTodo size={26} />}>Every open lead should have a next action.</Empty>}
                  <div className="task-list">{lead.tasks.map((t) => <TaskRow key={t.id} task={{ ...t, enquiryId: id }} showLead={false} onEdit={editable ? setEditTask : undefined} />)}</div>
                </div>
              )}
              {tab === 'viewings' && (
                <div className="stack-sm">
                  {editable && <Button icon={<CalendarPlus size={15} />} onClick={() => setModal('viewing')}>Schedule viewing</Button>}
                  {lead.viewings.length === 0 && <Empty title="No viewings yet" icon={<CalendarCheck size={26} />} />}
                  {lead.viewings.map((v) => (
                    <div key={v.id} className="viewing-row">
                      <div className="viewing-when">
                        <strong>{v.scheduledAt ? relDay(v.scheduledAt) : 'To schedule'}</strong>
                        <Badge tone={v.status === 'COMPLETED' ? 'teal' : v.status === 'REQUESTED' ? 'amber' : ['CANCELLED', 'NO_SHOW'].includes(v.status) ? 'grey' : 'purple'} plain>{VIEWING_STATUS_LABEL[v.status as ViewingStatusValue]}</Badge>
                      </div>
                      <div className="grow">
                        <div className="small">{v.units.map((u) => fmtCode(u.code)).join(', ') || 'No residence chosen'}{v.agent ? ` · ${v.agent.name}` : ''}</div>
                        {v.interestLevel && <div className="small"><strong>{VIEWING_INTEREST_LABEL[v.interestLevel as keyof typeof VIEWING_INTEREST_LABEL]}</strong>{v.outcome ? ` — ${v.outcome}` : ''}</div>}
                        {v.objections && <div className="small muted">Objections: {v.objections}</div>}
                        {v.alternativeUnit && <div className="small muted">Prefers {fmtCode(v.alternativeUnit.code)}</div>}
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        {editable && ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'].includes(v.status) && v.scheduledAt && new Date(v.scheduledAt).getTime() < Date.now() + 3_600_000 && <Button size="xs" variant="primary" onClick={() => setFeedbackFor(v)}>Record feedback</Button>}
                        <Link className="btn xs" to={`/viewings?open=${v.id}`}>Open</Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {tab === 'deals' && (
                <div className="stack">
                  {can('deal.edit') && !closed && <Button icon={<Handshake size={15} />} onClick={() => setModal('deal')}>Open a deal</Button>}
                  {lead.deals.length === 0 && <Empty title="No deals yet" icon={<Handshake size={26} />}>Open a deal when the buyer is negotiating on a specific residence.</Empty>}
                  {lead.deals.map((d) => (
                    <div key={d.id} className="deal-block">
                      <div className="row"><strong>{fmtCode(d.unit.code)}</strong><span className="muted small">opened {date(d.createdAt)}</span></div>
                      <DealPanel deal={d} />
                    </div>
                  ))}
                </div>
              )}
              {tab === 'documents' && <Documents lead={lead} />}
              {tab === 'history' && (
                <div className="stack">
                  <div>
                    <div className="field-label">Stage history</div>
                    <ol className="mini-history">
                      {lead.stageHistory.map((h) => <li key={h.id}><span>{h.fromLabel ? `${h.fromLabel} → ` : ''}<strong>{h.toLabel}</strong></span><small className="muted">{dateTime(h.createdAt)} · {h.hours < 48 ? `${h.hours} h` : `${Math.round(h.hours / 24)} days`} in stage</small></li>)}
                    </ol>
                  </div>
                  {lead.reservations.length > 0 && (
                    <div>
                      <div className="field-label">Reservations</div>
                      {lead.reservations.map((r) => <div key={r.id} className="row small" style={{ padding: '6px 0' }}><strong>{fmtCode(r.unit.code)}</strong> <Badge tone={r.status === 'ACTIVE' ? 'orange' : 'grey'} plain>{humanise(r.status)}</Badge> until {date(r.heldUntil)}</div>)}
                    </div>
                  )}
                  <div>
                    <div className="field-label">Emails to the customer</div>
                    {lead.notifications.length === 0 && <p className="muted small">None.</p>}
                    {lead.notifications.map((n) => (
                      <div key={n.id} className="row small" style={{ padding: '4px 0' }}>
                        <Badge tone={n.status === 'SENT' ? 'green' : n.status === 'QUEUED' ? 'sky' : 'red'} plain>{humanise(n.status)}</Badge>
                        <span style={{ flex: 1 }}>{NOTIFICATION_KIND_LABEL[n.kind] ?? n.kind} → {n.recipient}</span>
                        <span className="muted">{ago(n.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ── Right: next step, score, property ──────────────── */}
        <div className="stack lead-col-right">
          <Card className={nextTask && isPast(nextTask.dueAt) ? 'next-card overdue' : 'next-card'}>
            <div className="panel-head"><h3>Next action</h3>{editable && <Button size="xs" variant="ghost" onClick={() => setModal('task')}>+ Task</Button>}</div>
            <div className="card-body">
              {nextTask ? (
                <>
                  <TaskRow task={{ ...nextTask, enquiryId: id }} showLead={false} />
                  {openTasks.length > 1 && <button type="button" className="link-button small" onClick={() => set({ tab: 'tasks' })}>+{openTasks.length - 1} more open</button>}
                </>
              ) : closed ? (
                <p className="muted small">This lead is closed.</p>
              ) : (
                <div className="no-next">
                  <AlarmClock size={18} />
                  <div><strong>No next step</strong><p className="small muted">Every open lead needs one.</p></div>
                  {editable && <QuickFollowUp leadId={id} />}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <div className="panel-head"><h3>Lead score</h3><ScorePill score={lead.score} /></div>
            <div className="card-body">
              <div className="score-bar"><i style={{ width: `${lead.score}%` }} className={lead.score >= 70 ? 'high' : lead.score >= 40 ? 'mid' : 'low'} /></div>
              <ul className="score-items">
                {lead.scoreItems.map((it) => <li key={it.key}><span>{it.label}</span><strong className={it.points < 0 ? 'text-red' : 'text-green'}>{it.points > 0 ? '+' : ''}{it.points}</strong></li>)}
                {lead.scoreItems.length === 0 && <li className="muted small">No signals yet — capture the budget, timeline and the residence they want.</li>}
              </ul>
              <div className="row small" style={{ marginTop: 10, gap: 8 }}>
                <span className="muted">Temperature</span>
                <Select className="sm" disabled={!editable} value={lead.temperature ?? ''} onChange={(e) => void update({ temperature: e.target.value || null }, 'Temperature set.')} placeholder={`Auto (${TEMPERATURE_LABEL[lead.effectiveTemperature]})`} options={(['HOT', 'WARM', 'COLD'] as const).map((t) => ({ value: t, label: TEMPERATURE_LABEL[t] }))} />
              </div>
            </div>
          </Card>

          <Card>
            <div className="panel-head"><h3>Property interest</h3>{editable && <InterestAdder lead={lead} />}</div>
            <div className="card-body stack-sm">
              {lead.units.length === 0 && !lead.primaryUnit && <p className="muted small">No residence yet.</p>}
              {[...(lead.primaryUnit && !lead.units.some((u) => u.id === lead.primaryUnit!.id) ? [lead.primaryUnit] : []), ...lead.units].map((u) => (
                <div key={u.id} className="interest-row">
                  <UnitChip u={u} onRemove={editable ? () => void update({ unitIds: lead.units.filter((x) => x.id !== u.id).map((x) => x.id), ...(lead.primaryUnitId === u.id ? { primaryUnitId: null } : {}) }, `${fmtCode(u.code)} removed.`) : undefined} />
                  {lead.primaryUnitId === u.id ? <Badge tone="sky" plain>Primary</Badge> : editable && <button type="button" className="link-button small" onClick={() => void update({ primaryUnitId: u.id }, `${fmtCode(u.code)} is now the main residence.`)}>Make primary</button>}
                </div>
              ))}
            </div>
          </Card>

          {lead.similar.length > 0 && (
            <Card>
              <div className="panel-head"><h3>Similar available residences</h3></div>
              <div className="card-body similar-list">
                {lead.similar.map((u) => (
                  <div key={u.id} className="similar-row">
                    <Link to={`/residences/${u.id}`}><strong>{fmtCode(u.code)}</strong> · {u.typology.name}</Link>
                    <span className="small muted">{Math.round(u.areaSqm)} m² · floor {u.floor.label} · {money(u.priceMinor, u.currency, { compact: true })}</span>
                    <span className="small">{u.reasons.join(' · ')}</span>
                    {editable && <button type="button" className="link-button small" onClick={() => void update({ unitIds: [...lead.units.map((x) => x.id), u.id] }, `${fmtCode(u.code)} added to their interest.`)}>+ Add to interest</button>}
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <div className="panel-head"><h3>Tags</h3></div>
            <div className="card-body"><TagEditor tags={lead.tags} disabled={!editable} onChange={(tags) => void update({ tags }, 'Tags saved.')} /></div>
          </Card>

          {openDeals.length > 0 && (
            <Card>
              <div className="panel-head"><h3>Open deal</h3></div>
              <div className="card-body small">
                {openDeals.map((d) => <div key={d.id} className="row" style={{ justifyContent: 'space-between' }}><span><strong>{fmtCode(d.unit.code)}</strong> · {d.status.toLowerCase()}</span><strong className="tabular">{money(d.agreedPriceMinor ?? d.listPriceMinor, d.currency)}</strong></div>)}
                <button type="button" className="link-button small" onClick={() => set({ tab: 'deals' })}>Manage deal →</button>
              </div>
            </Card>
          )}
        </div>
      </div>

      {modal === 'task' && <TaskModal enquiryId={id} leadName={lead.name} onClose={() => setModal(null)} defaultType="FOLLOW_UP" />}
      {editTask && <TaskModal enquiryId={id} leadName={lead.name} task={editTask} onClose={() => setEditTask(null)} />}
      {modal === 'viewing' && <ViewingForm enquiryId={id} unitIds={[...new Set([...(lead.primaryUnitId ? [lead.primaryUnitId] : []), ...lead.units.map((u) => u.id)])]} onClose={() => { setModal(null); refreshCrm(); }} />}
      {modal === 'deal' && <DealModal enquiryId={id} leadName={lead.name} unitId={lead.primaryUnit?.status === 'AVAILABLE' ? lead.primaryUnitId : lead.units.find((u) => u.status === 'AVAILABLE')?.id} onClose={() => setModal(null)} />}
      {modal === 'edit' && <EditLeadModal lead={lead} onClose={() => setModal(null)} />}
      {modal === 'merge' && <MergeModal leadId={id} onClose={() => setModal(null)} />}
      {modal === 'lost' && <LostModal onClose={() => setModal(null)} onConfirm={(reason, note) => { setModal(null); const target = exits.find((x) => x.category === 'LOST'); void update({ ...(target ? { stageId: target.id } : { status: 'LOST' }), lostReason: reason, lostNote: note || null }, 'Marked as lost.'); }} />}
      {feedbackFor && <ViewingFeedbackModal viewing={{ ...feedbackFor, name: lead.name }} onClose={() => setFeedbackFor(null)} />}
    </>
  );
}

// ─── Activity ────────────────────────────────────────────────────────────

function Composer({ leadId, kind, setKind, inputRef }: { leadId: string; kind: string; setKind: (k: string) => void; inputRef: React.RefObject<HTMLTextAreaElement | null> }) {
  const toast = useToast();
  const [body, setBody] = useState('');
  const [direction, setDirection] = useState<'OUT' | 'IN'>('OUT');
  const [minutes, setMinutes] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [busy, setBusy] = useState(false);
  const contact = kind !== 'NOTE';
  const save = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await post(`/admin/enquiries/${leadId}/notes`, { kind, body, ...(contact ? { direction } : {}), ...(minutes ? { durationMin: Number(minutes) } : {}), ...(followUp ? { followUpAt: new Date(followUp).toISOString() } : {}) });
      setBody('');
      setMinutes('');
      setFollowUp('');
      toast.success(`${LEAD_NOTE_LABEL[kind]} logged.`);
      refreshCrm();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="composer">
      <div className="composer-kinds" role="group" aria-label="Activity type">
        {LEAD_NOTE_KINDS.map((k) => {
          const Icon = KIND_ICON[k] ?? StickyNote;
          return <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}><Icon size={14} /> {LEAD_NOTE_LABEL[k]}</button>;
        })}
      </div>
      <Textarea
        ref={inputRef}
        rows={3}
        value={body}
        placeholder={kind === 'CALL' ? 'What was said, and what happens next…' : kind === 'NOTE' ? 'A private note for the team…' : `What was ${kind === 'MEETING' ? 'discussed' : 'sent or received'}…`}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void save(); }}
      />
      <div className="composer-foot">
        {contact && (
          <div className="segmented sm" role="group" aria-label="Direction">
            <button type="button" aria-pressed={direction === 'OUT'} onClick={() => setDirection('OUT')}><ArrowUpRight size={13} /> Outbound</button>
            <button type="button" aria-pressed={direction === 'IN'} onClick={() => setDirection('IN')}><ArrowDownLeft size={13} /> Customer replied</button>
          </div>
        )}
        {(kind === 'CALL' || kind === 'MEETING') && <Input className="sm minutes" inputMode="numeric" placeholder="min" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} aria-label="Duration in minutes" />}
        <Menu align="left" trigger={(toggle) => <Button size="sm" variant="ghost" icon={<AlarmClock size={14} />} onClick={toggle}>{followUp ? relDay(followUp) : 'Follow-up'}</Button>}>
          {(close) => (
            <div style={{ padding: 8, minWidth: 250 }}>
              <Input type="datetime-local" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
              <DuePresets onPick={(d) => { setFollowUp(localDateTime(d)); close(); }} />
            </div>
          )}
        </Menu>
        <span className="spacer" />
        <span className="muted small hide-sm">Ctrl+Enter</span>
        <Button size="sm" variant="primary" busy={busy} disabled={!body.trim()} onClick={() => void save()}>Log {LEAD_NOTE_LABEL[kind]?.toLowerCase()}</Button>
      </div>
    </div>
  );
}

function Timeline({ notes, leadId, created }: { notes: Activity[]; leadId: string; created: string }) {
  const [filter, setFilter] = useState('');
  const toast = useToast();
  const { can } = useAuth();
  const shown = notes.filter((n) => !filter || (filter === 'contact' ? ['CALL', 'WHATSAPP', 'EMAIL', 'SMS', 'MEETING'].includes(n.kind) : filter === 'system' ? ['STATUS', 'SYSTEM', 'ASSIGNMENT', 'TASK'].includes(n.kind) : n.kind === filter));
  const groups = useMemo(() => {
    const out: { day: string; items: Activity[] }[] = [];
    for (const n of shown.filter((x) => !x.pinned)) {
      const day = relDay(n.createdAt, false);
      const g = out.at(-1);
      if (g && g.day === day) g.items.push(n);
      else out.push({ day, items: [n] });
    }
    return out;
  }, [shown]);
  const pinned = shown.filter((n) => n.pinned);
  const pin = async (n: Activity) => {
    try {
      await patch(`/admin/enquiries/${leadId}/notes/${n.id}`, { pinned: !n.pinned });
      refreshCrm();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const item = (n: Activity) => {
    const Icon = KIND_ICON[n.kind] ?? CircleDot;
    return (
      <li key={n.id} className={`tl-item kind-${n.kind.toLowerCase()}`}>
        <span className="tl-icon"><Icon size={14} /></span>
        <div className="tl-body">
          <div className="tl-head">
            <strong>{LEAD_NOTE_LABEL[n.kind] ?? n.kind}</strong>
            {n.direction === 'IN' && <Badge tone="green" plain>Customer</Badge>}
            {n.durationMin ? <span className="muted small">{n.durationMin} min</span> : null}
            <span className="muted small">{new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(n.createdAt))} · {n.authorName}</span>
            {can('enquiry.edit') && <button type="button" className={`tl-pin ${n.pinned ? 'on' : ''}`} aria-label={n.pinned ? 'Unpin' : 'Pin'} onClick={() => void pin(n)}><Pin size={12} /></button>}
          </div>
          <p>{n.body}</p>
        </div>
      </li>
    );
  };
  return (
    <div className="timeline-wrap">
      <div className="tl-filter">
        {[['', 'All'], ['contact', 'Conversations'], ['NOTE', 'Notes'], ['VIEWING', 'Viewings'], ['DEAL', 'Deals'], ['system', 'System']].map(([v, l]) => (
          <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v!)}>{l}</button>
        ))}
      </div>
      {pinned.length > 0 && <ol className="tl pinned">{pinned.map(item)}</ol>}
      {groups.map((g) => (
        <section key={g.day}>
          <h4 className="tl-day">{g.day}</h4>
          <ol className="tl">{g.items.map(item)}</ol>
        </section>
      ))}
      {shown.length === 0 && <p className="muted small">Nothing here yet.</p>}
      {!filter && <p className="tl-origin muted small">Lead created {dateTime(created)}</p>}
    </div>
  );
}

function QuickFollowUp({ leadId }: { leadId: string }) {
  const toast = useToast();
  return (
    <div className="due-presets">
      {(['tomorrow', 'in-3', 'next-week'] as const).map((k) => (
        <button key={k} type="button" onClick={async () => { try { await patch(`/admin/enquiries/${leadId}`, { followUpAt: presetDue(k).toISOString() }); toast.success('Follow-up set.'); refreshCrm(); } catch (e) { toast.error((e as Error).message); } }}>
          {k === 'tomorrow' ? 'Tomorrow' : k === 'in-3' ? 'In 3 days' : 'Next week'}
        </button>
      ))}
    </div>
  );
}

function InterestAdder({ lead }: { lead: LeadDetail }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [unitId, setUnitId] = useState('');
  if (!open) return <Button size="xs" variant="ghost" onClick={() => setOpen(true)}>+ Add</Button>;
  return (
    <Modal title="Add a residence of interest" onClose={() => setOpen(false)} footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={!unitId} onClick={async () => { try { await patch(`/admin/enquiries/${lead.id}`, { unitIds: [...lead.units.map((u) => u.id), unitId], ...(lead.primaryUnitId ? {} : { primaryUnitId: unitId }) }); toast.success('Added.'); refreshCrm(); setOpen(false); } catch (e) { toast.error((e as Error).message); } }}>Add</Button></>}>
      <Field label="Residence"><UnitPicker value={unitId} onChange={setUnitId} exclude={lead.units.map((u) => u.id)} /></Field>
    </Modal>
  );
}

function TagEditor({ tags, onChange, disabled }: { tags: string[]; onChange: (t: string[]) => void; disabled?: boolean }) {
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim().toLowerCase();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setText('');
  };
  return (
    <div className="tag-editor">
      {tags.map((t) => <span key={t} className="tag">#{t}{!disabled && <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>×</button>}</span>)}
      {!disabled && <Input className="sm" value={text} placeholder="Add tag" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.preventDefault(), add()); }} onBlur={add} />}
      {disabled && tags.length === 0 && <span className="muted small">No tags.</span>}
    </div>
  );
}

// ─── Documents ───────────────────────────────────────────────────────────

function Documents({ lead }: { lead: LeadDetail }) {
  const toast = useToast();
  const { can } = useAuth();
  const [kind, setKind] = useState('QUOTATION');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const send = async (f: File) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('kind', kind);
      form.append('sent', String(sent));
      form.append('file', f);
      await upload(`/admin/crm/leads/${lead.id}/documents`, form);
      toast.success('Document added.');
      refreshCrm();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };
  return (
    <div className="stack-sm">
      {can('enquiry.edit') && (
        <div className="doc-upload">
          <Select className="sm" style={{ width: 'auto' }} value={kind} onChange={(e) => setKind(e.target.value)} options={DOCUMENT_KINDS.map((k) => ({ value: k, label: DOCUMENT_KIND_LABEL[k] }))} />
          <Checkbox checked={sent} onChange={setSent} label="Sent to the customer" />
          <input ref={file} type="file" hidden accept=".pdf,image/*" onChange={(e) => e.target.files?.[0] && void send(e.target.files[0])} />
          <Button size="sm" variant="primary" busy={busy} icon={<Upload size={14} />} onClick={() => file.current?.click()}>Upload PDF or image</Button>
        </div>
      )}
      {lead.documents.length === 0 && <Empty title="No documents" icon={<FileText size={26} />}>Quotations, agreements, receipts and ID copies live here — private to the sales team.</Empty>}
      {lead.documents.map((d) => (
        <div key={d.id} className="doc-row">
          <FileText size={18} />
          <div className="grow">
            <a href={downloadUrl(`/admin/crm/documents/${d.id}/file`)} target="_blank" rel="noreferrer"><strong>{d.name}</strong></a>
            <div className="small muted">{DOCUMENT_KIND_LABEL[d.kind as keyof typeof DOCUMENT_KIND_LABEL]} · {d.sizeBytes ? bytes(d.sizeBytes) : ''} · {d.uploadedBy?.name ?? '—'} · {ago(d.createdAt)}{d.sentAt ? ' · sent' : ''}</div>
          </div>
          {can('enquiry.edit') && <Button size="xs" variant="ghost" onClick={async () => { try { await del(`/admin/crm/documents/${d.id}`); toast.success('Removed.'); refreshCrm(); } catch (e) { toast.error((e as Error).message); } }}>Remove</Button>}
        </div>
      ))}
    </div>
  );
}

// ─── Edit & merge ────────────────────────────────────────────────────────

function EditLeadModal({ lead, onClose }: { lead: LeadDetail; onClose: () => void }) {
  const toast = useToast();
  const { data: types } = useTypes();
  const { data: campaigns } = useQuery('crm:campaigns', () => get<{ id: string; name: string }[]>('/admin/crm/campaigns'));
  const [d, setD] = useState({
    name: lead.name, phone: lead.phone ?? '', whatsapp: lead.whatsapp ?? '', email: lead.email ?? '', city: lead.city ?? '', countryIso: lead.countryIso ?? '', preferredContact: lead.preferredContact ?? '',
    leadSource: lead.leadSource, campaignId: lead.campaign?.id ?? '', priority: lead.priority,
    typologyId: lead.typologyId ?? '', bedrooms: lead.bedrooms?.toString() ?? '', sizeMinSqm: lead.sizeMinSqm?.toString() ?? '', sizeMaxSqm: lead.sizeMaxSqm?.toString() ?? '', budgetMinMinor: lead.budgetMinMinor, budgetMaxMinor: lead.budgetMaxMinor,
    floorPreference: lead.floorPreference ?? '', purpose: lead.purpose ?? '', financingRequired: lead.financingRequired === null ? '' : String(lead.financingRequired), budgetConfirmed: lead.budgetConfirmed, timeline: lead.timeline ?? '', decisionMaker: lead.decisionMaker ?? '', message: lead.message ?? '',
  });
  const [busy, setBusy] = useState(false);
  const f = (k: keyof typeof d) => ({ value: d[k] as string, onChange: (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value }) });
  const save = async () => {
    setBusy(true);
    const n = (v: string) => (v === '' ? null : Number(v));
    try {
      await patch(`/admin/enquiries/${lead.id}`, {
        name: d.name, phone: d.phone || null, whatsapp: d.whatsapp || null, email: d.email || null, city: d.city || null, countryIso: d.countryIso || null, preferredContact: d.preferredContact || null,
        leadSource: d.leadSource, campaignId: d.campaignId || null, priority: d.priority,
        typologyId: d.typologyId || null, bedrooms: n(d.bedrooms), sizeMinSqm: n(d.sizeMinSqm), sizeMaxSqm: n(d.sizeMaxSqm), budgetMinMinor: d.budgetMinMinor, budgetMaxMinor: d.budgetMaxMinor,
        floorPreference: d.floorPreference || null, purpose: d.purpose || null, financingRequired: d.financingRequired === '' ? null : d.financingRequired === 'true', budgetConfirmed: d.budgetConfirmed, timeline: d.timeline || null, decisionMaker: d.decisionMaker || null, message: d.message || null,
      });
      toast.success('Lead updated.');
      refreshCrm();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal size="lg" title="Edit lead" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} onClick={() => void save()}>Save</Button></>}>
      <div className="stack">
        <div className="form-section">
          <h3>Contact</h3>
          <div className="grid-2">
            <Field label="Full name"><Input {...f('name')} /></Field>
            <Field label="Phone"><Input {...f('phone')} inputMode="tel" /></Field>
            <Field label="WhatsApp"><Input {...f('whatsapp')} inputMode="tel" /></Field>
            <Field label="Email"><Input type="email" {...f('email')} /></Field>
            <Field label="City"><Input {...f('city')} /></Field>
            <Field label="Country (ISO)"><Input {...f('countryIso')} maxLength={2} /></Field>
            <Field label="Preferred contact"><Select {...f('preferredContact')} placeholder="Any" options={CONTACT_METHODS.map((m) => ({ value: m, label: CONTACT_METHOD_LABEL[m] }))} /></Field>
            <Field label="Priority"><Select {...f('priority')} options={CRM_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} /></Field>
            <Field label="Source"><Select {...f('leadSource')} options={LEAD_SOURCES.map((x) => ({ value: x, label: LEAD_SOURCE_LABEL[x] }))} /></Field>
            <Field label="Campaign"><Select {...f('campaignId')} placeholder="None" options={(campaigns ?? []).map((c) => ({ value: c.id, label: c.name }))} /></Field>
          </div>
        </div>
        <div className="form-section">
          <h3>Requirements & qualification</h3>
          <div className="grid-2">
            <Field label="Residence type"><Select {...f('typologyId')} placeholder="Any" options={(types ?? []).map((t) => ({ value: t.id, label: t.name }))} /></Field>
            <Field label="Bedrooms"><Select {...f('bedrooms')} placeholder="Any" options={[1, 2, 3, 4].map((x) => ({ value: String(x), label: String(x) }))} /></Field>
            <Field label="Size from (m²)"><Input inputMode="numeric" {...f('sizeMinSqm')} /></Field>
            <Field label="Size to (m²)"><Input inputMode="numeric" {...f('sizeMaxSqm')} /></Field>
            <Field label="Budget from"><MoneyInput value={d.budgetMinMinor} onChange={(v) => setD({ ...d, budgetMinMinor: v })} /></Field>
            <Field label="Budget up to"><MoneyInput value={d.budgetMaxMinor} onChange={(v) => setD({ ...d, budgetMaxMinor: v })} /></Field>
            <Field label="Floor preference"><Input {...f('floorPreference')} placeholder="High floor" /></Field>
            <Field label="Purpose"><Select {...f('purpose')} placeholder="Not asked" options={LEAD_PURPOSES.map((p) => ({ value: p, label: LEAD_PURPOSE_LABEL[p] }))} /></Field>
            <Field label="Financing"><Select {...f('financingRequired')} placeholder="Not asked" options={[{ value: 'false', label: 'Cash / own funds' }, { value: 'true', label: 'Needs financing' }]} /></Field>
            <Field label="Timeline"><Select {...f('timeline')} placeholder="Not asked" options={PURCHASE_TIMELINES.map((t) => ({ value: t, label: PURCHASE_TIMELINE_LABEL[t] }))} /></Field>
            <Field label="Decision maker"><Input {...f('decisionMaker')} placeholder="Self, with spouse" /></Field>
            <Field label=" "><Checkbox checked={d.budgetConfirmed} onChange={(v) => setD({ ...d, budgetConfirmed: v })} label="Budget confirmed" /></Field>
          </div>
          <Field label="Their message / notes"><Textarea rows={3} {...f('message')} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function MergeModal({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const { data } = useQuery(q.trim().length >= 2 ? `enquiries:merge:${q}` : null, () => get<{ data: LeadRow[] }>(`/admin/enquiries?q=${encodeURIComponent(q.trim())}&pageSize=8`));
  const merge = async (other: LeadRow) => {
    try {
      await post(`/admin/enquiries/${leadId}/merge`, { otherId: other.id });
      toast.success(`${other.name} merged into this lead.`);
      refreshCrm();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Modal title="Merge a duplicate into this lead" sub="The other lead’s history, tasks, viewings and deals move here; it is then archived." onClose={onClose}>
      <Field label="Find the duplicate"><Input autoFocus value={q} placeholder="Name, phone or email" onChange={(e) => setQ(e.target.value)} /></Field>
      <div className="dup-list" style={{ marginTop: 10 }}>
        {(data?.data ?? []).filter((l) => l.id !== leadId).map((l) => (
          <div key={l.id} className="dup-row">
            <div><strong>{l.name}</strong><div className="small muted">{l.stage?.label ?? STAGE_LABEL[l.status]} · {l.phone ?? l.email} · {ago(l.createdAt)}</div></div>
            <span />
            <Button size="xs" onClick={() => void merge(l)}>Merge here <ChevronDown size={12} style={{ transform: 'rotate(-90deg)' }} /></Button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
