import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CalendarClock, Check, Flame, Mail, MessageCircle, MessageSquareText, Phone, Snowflake, Thermometer, UserRound } from 'lucide-react';
import {
  CRM_PRIORITIES,
  LEAD_SOURCE_LABEL,
  LEAD_SOURCES,
  LOST_REASON_LABEL,
  LOST_REASONS,
  PRIORITY_LABEL,
  PRIORITY_TONE,
  PURCHASE_TIMELINE_LABEL,
  PURCHASE_TIMELINES,
  TASK_TYPE_LABEL,
  TASK_TYPES,
  TEMPERATURE_LABEL,
  VIEWING_INTEREST_LABEL,
  VIEWING_INTERESTS,
  type CrmPriorityValue,
  type LeadTemperatureValue,
  type TaskTypeValue,
} from '@avida/types';
import { get, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { localDateTime, presetDue, refreshCrm, relDay, whatsappUrl, type Task, type UnitCard } from '../lib/crm';
import { code as fmtCode, money } from '../lib/format';
import { useQuery } from '../lib/query';
import { useTeam, useTypes } from '../lib/ref';
import { Link, navigate, useDebounced } from '../lib/router';
import type { Paged, ResidenceRow } from '../lib/types';
import { useToast } from './Toast';
import { Badge, Button, Checkbox, Field, Input, Modal, MoneyInput, Select, Textarea } from './ui';

// ─── Badges ──────────────────────────────────────────────────────────────

export function TempBadge({ temp, compact }: { temp: string; compact?: boolean }) {
  const t = temp as LeadTemperatureValue;
  const Icon = t === 'HOT' ? Flame : t === 'WARM' ? Thermometer : Snowflake;
  return (
    <span className={`temp temp-${t.toLowerCase()}`} title={`${TEMPERATURE_LABEL[t]} lead`}>
      <Icon size={12} aria-hidden="true" />
      {!compact && TEMPERATURE_LABEL[t]}
    </span>
  );
}

export function ScorePill({ score, title }: { score: number; title?: string }) {
  const band = score >= 70 ? 'high' : score >= 40 ? 'mid' : 'low';
  return (
    <span className={`score-pill score-${band}`} title={title ?? `Lead score ${score} of 100`}>
      <span className="tabular">{score}</span>
    </span>
  );
}

export function StageBadge({ label, color }: { label: string; color?: string | null }) {
  return (
    <span className={`stage-badge tone-${color ?? 'grey'}`}>
      <i aria-hidden="true" />
      {label}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  if (priority === 'NORMAL') return null;
  return <Badge tone={PRIORITY_TONE[priority as CrmPriorityValue]} plain>{PRIORITY_LABEL[priority as CrmPriorityValue]}</Badge>;
}

export function Avatar({ name, size = 26 }: { name: string | null | undefined; size?: number }) {
  if (!name) return <span className="crm-avatar is-empty" style={{ width: size, height: size }} title="Unassigned"><UserRound size={size * 0.55} /></span>;
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  return <span className="crm-avatar" style={{ width: size, height: size, fontSize: size * 0.4 }} title={name}>{letters}</span>;
}

// ─── Contact ─────────────────────────────────────────────────────────────

/**
 * Call, WhatsApp, email and SMS open the device's own app; `onContact` lets
 * the page offer to log what happened, so the timeline stays complete.
 */
export function ContactActions({ lead, onContact, size = 'sm' }: { lead: { name: string; phone: string | null; whatsapp: string | null; email: string | null }; onContact?: (kind: 'CALL' | 'WHATSAPP' | 'EMAIL' | 'SMS') => void; size?: 'sm' | 'md' }) {
  const wa = lead.whatsapp ?? lead.phone;
  const cls = `btn ${size === 'sm' ? 'sm' : ''}`;
  return (
    <div className="contact-actions">
      {lead.phone && <a className={cls} href={`tel:${lead.phone}`} onClick={() => onContact?.('CALL')}><Phone size={15} /> Call</a>}
      {wa && <a className={cls} href={whatsappUrl(wa, `Hello ${lead.name.split(' ')[0]}, `)} target="_blank" rel="noreferrer" onClick={() => onContact?.('WHATSAPP')}><MessageCircle size={15} /> WhatsApp</a>}
      {lead.email && <a className={cls} href={`mailto:${lead.email}`} onClick={() => onContact?.('EMAIL')}><Mail size={15} /> Email</a>}
      {lead.phone && <a className={cls} href={`sms:${lead.phone}`} onClick={() => onContact?.('SMS')}><MessageSquareText size={15} /> SMS</a>}
    </div>
  );
}

// ─── Residences ──────────────────────────────────────────────────────────

export function useResidences() {
  return useQuery('residences:crm-picker', () => get<Paged<ResidenceRow>>('/admin/residences?pageSize=500&sort=code'));
}

export const unitLine = (u: { code: string; bedrooms: number; areaSqm: number; typology?: { name: string } }) => `${fmtCode(u.code)} · ${u.typology?.name ?? `${u.bedrooms} bed`} · ${Math.round(u.areaSqm)} m²`;

export function UnitPicker({ value, onChange, placeholder = 'Choose a residence', onlyOpen, exclude }: { value: string; onChange: (id: string) => void; placeholder?: string; onlyOpen?: boolean; exclude?: string[] }) {
  const { data } = useResidences();
  const rows = (data?.data ?? []).filter((u) => (!onlyOpen || u.status === 'AVAILABLE' || u.id === value) && !exclude?.includes(u.id));
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={data ? placeholder : 'Loading residences…'}
      options={rows.map((u) => ({ value: u.id, label: `${unitLine(u)} · ${money(u.effectivePriceMinor, u.currency)}${u.status !== 'AVAILABLE' ? ` · ${u.status.toLowerCase()}` : ''}` }))}
    />
  );
}

export function UnitChip({ u, onRemove }: { u: UnitCard; onRemove?: () => void }) {
  return (
    <span className="unit-chip">
      <Link to={`/residences/${u.id}`}><strong>{fmtCode(u.code)}</strong> {u.typology.name} · {Math.round(u.areaSqm)} m² · {money(u.priceMinor, u.currency)}</Link>
      <Badge tone={u.status === 'AVAILABLE' ? 'green' : u.status === 'SOLD' ? 'red' : 'orange'} plain>{u.status.toLowerCase()}</Badge>
      {onRemove && <button type="button" aria-label={`Remove ${u.code}`} onClick={onRemove}>×</button>}
    </span>
  );
}

// ─── Tasks ───────────────────────────────────────────────────────────────

export function DuePresets({ onPick }: { onPick: (d: Date) => void }) {
  return (
    <div className="due-presets">
      {(['later', 'tomorrow', 'in-3', 'next-week'] as const).map((k) => (
        <button key={k} type="button" onClick={() => onPick(presetDue(k))}>{k === 'later' ? 'In 2 hours' : k === 'tomorrow' ? 'Tomorrow' : k === 'in-3' ? 'In 3 days' : 'Next week'}</button>
      ))}
    </div>
  );
}

/** Create or edit a task. A task on a lead defaults to its owner. */
export function TaskModal({ enquiryId, leadName, task, onClose, defaultType }: { enquiryId?: string | null; leadName?: string; task?: Task; onClose: () => void; defaultType?: TaskTypeValue }) {
  const toast = useToast();
  const { can, user } = useAuth();
  const { data: team } = useTeam();
  const [d, setD] = useState({
    title: task?.title ?? (defaultType && leadName ? `${TASK_TYPE_LABEL[defaultType]} — ${leadName.split(' ')[0]}` : ''),
    type: task?.type ?? defaultType ?? 'FOLLOW_UP',
    priority: task?.priority ?? 'NORMAL',
    dueAt: task?.dueAt ? localDateTime(task.dueAt) : localDateTime(presetDue('tomorrow')),
    assignedToId: task?.assignedToId ?? '',
    notes: task?.notes ?? '',
  });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const body = { title: d.title, type: d.type, priority: d.priority, dueAt: d.dueAt ? new Date(d.dueAt).toISOString() : null, notes: d.notes || null, ...(d.assignedToId ? { assignedToId: d.assignedToId } : {}) };
      if (task) await patch(`/admin/crm/tasks/${task.id}`, body);
      else await post('/admin/crm/tasks', { ...body, enquiryId: enquiryId ?? null });
      toast.success(task ? 'Task updated.' : 'Task added.');
      refreshCrm();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={task ? 'Edit task' : 'New task'} sub={leadName ? `For ${leadName}` : undefined} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} disabled={!d.title.trim()} onClick={() => void save()}>{task ? 'Save' : 'Add task'}</Button></>}>
      <div className="stack-sm">
        <Field label="What needs doing">
          <Input value={d.title} autoFocus placeholder="Call Sarah about the payment plan" onChange={(e) => setD({ ...d, title: e.target.value })} />
        </Field>
        <div className="grid-2">
          <Field label="Type">
            <Select value={d.type} onChange={(e) => setD({ ...d, type: e.target.value, title: d.title || (leadName ? `${TASK_TYPE_LABEL[e.target.value as TaskTypeValue]} — ${leadName.split(' ')[0]}` : '') })} options={TASK_TYPES.map((t) => ({ value: t, label: TASK_TYPE_LABEL[t] }))} />
          </Field>
          <Field label="Priority">
            <Select value={d.priority} onChange={(e) => setD({ ...d, priority: e.target.value })} options={CRM_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} />
          </Field>
          <Field label="Due">
            <Input type="datetime-local" value={d.dueAt} onChange={(e) => setD({ ...d, dueAt: e.target.value })} />
          </Field>
          <Field label="Assigned to" hint={can('enquiry.assign') ? undefined : 'Only managers can give tasks to others.'}>
            <Select value={d.assignedToId} disabled={!can('enquiry.assign')} onChange={(e) => setD({ ...d, assignedToId: e.target.value })} placeholder={enquiryId ? 'The lead’s owner' : user?.name ?? 'Me'} options={(team ?? []).map((t) => ({ value: t.id, label: t.name }))} />
          </Field>
        </div>
        <DuePresets onPick={(dt) => setD({ ...d, dueAt: localDateTime(dt) })} />
        <Field label="Notes (optional)">
          <Textarea rows={2} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

/** Done — with what happened, and what happens next, in one step. */
export function CompleteTaskModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const toast = useToast();
  const [outcome, setOutcome] = useState('');
  const [next, setNext] = useState(false);
  const [n, setN] = useState({ title: '', type: 'FOLLOW_UP', dueAt: localDateTime(presetDue('in-3')) });
  const [busy, setBusy] = useState(false);
  const done = async () => {
    setBusy(true);
    try {
      await post(`/admin/crm/tasks/${task.id}/complete`, { outcome: outcome || undefined, ...(next && n.title.trim() ? { next: { title: n.title, type: n.type, dueAt: n.dueAt ? new Date(n.dueAt).toISOString() : null } } : {}) });
      toast.success(next ? 'Done — next action set.' : 'Task done.');
      refreshCrm();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Complete task" sub={task.title} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} icon={<Check size={15} />} onClick={() => void done()}>Mark done</Button></>}>
      <div className="stack-sm">
        {task.enquiryId && (
          <Field label="What happened?" hint="Logged on the lead’s timeline.">
            <Textarea rows={3} autoFocus value={outcome} placeholder="Spoke to her — wants the 3rd-floor unit, sending the quotation." onChange={(e) => setOutcome(e.target.value)} />
          </Field>
        )}
        {task.enquiryId && <Checkbox checked={next} onChange={setNext} label="Set the next action now" />}
        {next && (
          <div className="next-action">
            <Field label="Next action"><Input value={n.title} placeholder="Follow up on the quotation" onChange={(e) => setN({ ...n, title: e.target.value })} /></Field>
            <div className="grid-2">
              <Field label="Type"><Select value={n.type} onChange={(e) => setN({ ...n, type: e.target.value })} options={TASK_TYPES.map((t) => ({ value: t, label: TASK_TYPE_LABEL[t] }))} /></Field>
              <Field label="Due"><Input type="datetime-local" value={n.dueAt} onChange={(e) => setN({ ...n, dueAt: e.target.value })} /></Field>
            </div>
            <DuePresets onPick={(dt) => setN({ ...n, dueAt: localDateTime(dt) })} />
          </div>
        )}
      </div>
    </Modal>
  );
}

/** One task, one line: tick it, see who and when, open the lead. */
export function TaskRow({ task, showLead = true, onEdit }: { task: Task; showLead?: boolean; onEdit?: (t: Task) => void }) {
  const [completing, setCompleting] = useState(false);
  const { can } = useAuth();
  const overdue = task.status === 'OPEN' && task.dueAt && new Date(task.dueAt).getTime() < Date.now();
  const done = task.status !== 'OPEN';
  return (
    <div className={`task-row ${overdue ? 'is-overdue' : ''} ${done ? 'is-done' : ''}`}>
      <button type="button" className="task-check" aria-label={done ? 'Done' : `Complete ${task.title}`} disabled={done || !can('enquiry.edit')} onClick={() => setCompleting(true)}>
        {done && <Check size={13} />}
      </button>
      <div className="task-main">
        <button type="button" className="task-title" onClick={() => (onEdit ? onEdit(task) : task.enquiryId && navigate(`/crm/leads/${task.enquiryId}`))}>
          {task.title}
        </button>
        <div className="task-meta">
          <span className={overdue ? 'due overdue' : 'due'}><CalendarClock size={12} /> {task.dueAt ? relDay(task.dueAt) : 'No date'}</span>
          <span>{TASK_TYPE_LABEL[task.type as TaskTypeValue] ?? task.type}</span>
          {showLead && task.enquiry && <Link to={`/crm/leads/${task.enquiry.id}`}>{task.enquiry.name}</Link>}
          {task.unit && <span>{fmtCode(task.unit.code)}</span>}
          {task.assignedTo && <span className="muted">{task.assignedTo.name}</span>}
        </div>
      </div>
      <PriorityBadge priority={task.priority} />
      {completing && <CompleteTaskModal task={task} onClose={() => setCompleting(false)} />}
    </div>
  );
}

// ─── Leads ───────────────────────────────────────────────────────────────

interface DuplicateMatch {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  stage: string;
  owner: string | null;
  createdAt: string;
  reasons: string[];
  strong: boolean;
  canOpen: boolean;
}

export function DuplicateList({ matches, onMerge }: { matches: DuplicateMatch[]; onMerge?: (id: string) => void }) {
  return (
    <div className="dup-list">
      {matches.map((m) => (
        <div key={m.id} className="dup-row">
          <div>
            <strong>{m.name}</strong>
            <div className="small muted">{m.stage}{m.owner ? ` · ${m.owner}` : ' · unassigned'} · {relDay(m.createdAt, false)}{m.phone ? ` · ${m.phone}` : ''}</div>
          </div>
          <div className="row-wrap" style={{ gap: 4 }}>
            {m.reasons.map((r) => <Badge key={r} tone={r === 'Same name' ? 'grey' : 'orange'} plain>{r}</Badge>)}
          </div>
          <div className="row" style={{ gap: 6 }}>
            {m.canOpen && <Link className="btn xs" to={`/crm/leads/${m.id}`}>Open</Link>}
            {onMerge && m.canOpen && <Button size="xs" onClick={() => onMerge(m.id)}>Merge here</Button>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A lead from a call, a walk-in, a portal. Checks for an existing lead while you type. */
export function NewLeadModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const { can, user } = useAuth();
  const { data: team } = useTeam();
  const { data: types } = useTypes();
  const [d, setD] = useState({ name: '', phone: '', whatsapp: '', email: '', city: '', countryIso: 'RW', leadSource: 'PHONE', primaryUnitId: '', typologyId: '', bedrooms: '', budgetMaxMinor: null as number | null, timeline: '', message: '', assignedToId: can('enquiry.assign') ? '' : (user?.id ?? ''), followUp: localDateTime(presetDue('tomorrow')) });
  const [busy, setBusy] = useState(false);
  const probe = useDebounced(`${d.name}|${d.phone}|${d.email}`, 450);
  const [matches, setMatches] = useState<DuplicateMatch[]>([]);
  useEffect(() => {
    const [name, phone, email] = probe.split('|');
    if ((name?.length ?? 0) < 4 && (phone?.replace(/\D/g, '').length ?? 0) < 7 && !email?.includes('@')) return setMatches([]);
    let live = true;
    void post<{ matches: DuplicateMatch[] }>('/admin/enquiries/duplicates', { name, phone, email }).then((r) => live && setMatches(r.matches)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [probe]);
  const strong = matches.filter((m) => m.strong);
  const save = async () => {
    setBusy(true);
    try {
      const r = await post<{ id: string }>('/admin/enquiries', {
        name: d.name,
        phone: d.phone || null,
        whatsapp: d.whatsapp || null,
        email: d.email || null,
        city: d.city || null,
        countryIso: d.countryIso || null,
        leadSource: d.leadSource,
        primaryUnitId: d.primaryUnitId || null,
        typologyId: d.typologyId || null,
        bedrooms: d.bedrooms ? Number(d.bedrooms) : null,
        budgetMaxMinor: d.budgetMaxMinor,
        timeline: d.timeline || null,
        message: d.message || null,
        ...(d.assignedToId ? { assignedToId: d.assignedToId } : {}),
        followUpAt: d.followUp ? new Date(d.followUp).toISOString() : null,
        force: strong.length > 0,
      });
      toast.success(`${d.name} added to the pipeline.`);
      refreshCrm();
      onClose();
      navigate(`/crm/leads/${r.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      size="lg"
      title="New lead"
      sub="A call, a walk-in, a referral or a portal enquiry. Website leads arrive on their own."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={strong.length ? 'danger' : 'primary'} className={strong.length ? 'solid' : ''} busy={busy} disabled={!d.name.trim() || (!d.phone && !d.email && !d.whatsapp)} onClick={() => void save()}>
            {strong.length ? 'Create anyway' : 'Create lead'}
          </Button>
        </>
      }
    >
      <div className="stack">
        {matches.length > 0 && (
          <div className={`alert ${strong.length ? 'warn' : 'info'}`} style={{ display: 'block' }}>
            <div className="row" style={{ gap: 8, marginBottom: 8 }}><AlertTriangle size={16} /> <strong>{strong.length ? 'Possible existing lead' : 'Someone with this name already exists'}</strong></div>
            <DuplicateList matches={matches} />
          </div>
        )}
        <div className="form-section">
          <h3>Contact</h3>
          <div className="grid-2">
            <Field label="Full name"><Input autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
            <Field label="Phone" hint="With country code, e.g. +250 788 123 456"><Input value={d.phone} inputMode="tel" onChange={(e) => setD({ ...d, phone: e.target.value })} /></Field>
            <Field label="WhatsApp (if different)"><Input value={d.whatsapp} inputMode="tel" onChange={(e) => setD({ ...d, whatsapp: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} /></Field>
            <Field label="City"><Input value={d.city} onChange={(e) => setD({ ...d, city: e.target.value })} /></Field>
            <Field label="Country (ISO)"><Input value={d.countryIso} maxLength={2} onChange={(e) => setD({ ...d, countryIso: e.target.value.toUpperCase() })} /></Field>
          </div>
        </div>
        <div className="form-section">
          <h3>Interest</h3>
          <div className="grid-2">
            <Field label="Source"><Select value={d.leadSource} onChange={(e) => setD({ ...d, leadSource: e.target.value })} options={LEAD_SOURCES.map((s) => ({ value: s, label: LEAD_SOURCE_LABEL[s] }))} /></Field>
            <Field label="Specific residence (optional)"><UnitPicker value={d.primaryUnitId} onChange={(v) => setD({ ...d, primaryUnitId: v })} placeholder="Not yet" /></Field>
            <Field label="Residence type"><Select value={d.typologyId} onChange={(e) => setD({ ...d, typologyId: e.target.value })} placeholder="Any" options={(types ?? []).map((t) => ({ value: t.id, label: t.name }))} /></Field>
            <Field label="Bedrooms"><Select value={d.bedrooms} onChange={(e) => setD({ ...d, bedrooms: e.target.value })} placeholder="Any" options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: `${n} bedroom${n > 1 ? 's' : ''}` }))} /></Field>
            <Field label="Budget (up to)"><MoneyInput value={d.budgetMaxMinor} onChange={(v) => setD({ ...d, budgetMaxMinor: v })} /></Field>
            <Field label="Buying timeline"><Select value={d.timeline} onChange={(e) => setD({ ...d, timeline: e.target.value })} placeholder="Not asked yet" options={PURCHASE_TIMELINES.map((t) => ({ value: t, label: PURCHASE_TIMELINE_LABEL[t] }))} /></Field>
          </div>
          <Field label="Notes"><Textarea rows={2} value={d.message} placeholder="What they asked for, in their words." onChange={(e) => setD({ ...d, message: e.target.value })} /></Field>
        </div>
        <div className="grid-2">
          <Field label="Owner" hint={can('enquiry.assign') ? 'Empty uses the unassigned pool.' : 'Leads you create are yours.'}>
            <Select value={d.assignedToId} disabled={!can('enquiry.assign')} onChange={(e) => setD({ ...d, assignedToId: e.target.value })} placeholder="Unassigned" options={(team ?? []).map((t) => ({ value: t.id, label: t.name }))} />
          </Field>
          <Field label="First follow-up"><Input type="datetime-local" value={d.followUp} onChange={(e) => setD({ ...d, followUp: e.target.value })} /></Field>
        </div>
      </div>
    </Modal>
  );
}

export function LostModal({ onConfirm, onClose, count = 1, title }: { onConfirm: (reason: string, note: string) => void; onClose: () => void; count?: number; title?: string }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  return (
    <Modal title={title ?? (count > 1 ? `Mark ${count} leads as lost` : 'Mark as lost')} sub="The reason is what the reports learn from." onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!reason} onClick={() => onConfirm(reason, note)}>Confirm</Button></>}>
      <Field label="Why?">
        <Select value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Choose a reason" options={LOST_REASONS.map((r) => ({ value: r, label: LOST_REASON_LABEL[r] }))} />
      </Field>
      {count === 1 && <Field label="Anything to add (optional)"><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>}
    </Modal>
  );
}

// ─── Deals ───────────────────────────────────────────────────────────────

/** Open a deal on one residence for this lead. */
export function DealModal({ enquiryId, leadName, unitId, onClose }: { enquiryId: string; leadName: string; unitId?: string | null; onClose: () => void }) {
  const toast = useToast();
  const { can } = useAuth();
  const { data: residences } = useResidences();
  const { data: plans } = useQuery('payment-plans', () => get<{ id: string; name: string }[]>('/admin/payment-plans'));
  const [d, setD] = useState({ unitId: unitId ?? '', agreedPriceMinor: null as number | null, reservationAmountMinor: null as number | null, paymentPlanId: '', expectedCloseAt: '', notes: '' });
  const unit = residences?.data.find((u) => u.id === d.unitId);
  const discount = unit && d.agreedPriceMinor !== null ? unit.effectivePriceMinor - d.agreedPriceMinor : null;
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await post('/admin/crm/deals', { enquiryId, unitId: d.unitId, ...(d.agreedPriceMinor !== null ? { agreedPriceMinor: d.agreedPriceMinor } : {}), reservationAmountMinor: d.reservationAmountMinor, paymentPlanId: d.paymentPlanId || null, expectedCloseAt: d.expectedCloseAt ? new Date(`${d.expectedCloseAt}T12:00:00`).toISOString() : null, notes: d.notes || null });
      toast.success('Deal opened — the lead is in negotiation.');
      refreshCrm();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Open a deal" sub={`${leadName} — negotiation on one residence`} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} disabled={!d.unitId} onClick={() => void save()}>Open deal</Button></>}>
      <div className="stack-sm">
        <Field label="Residence"><UnitPicker value={d.unitId} onChange={(v) => setD({ ...d, unitId: v })} onlyOpen /></Field>
        {unit && <p className="small muted" style={{ margin: 0 }}>List price {money(unit.effectivePriceMinor, unit.currency)} · {unit.typology.name} · floor {unit.floor.label}</p>}
        <div className="grid-2">
          <Field label="Agreed price" hint={can('deal.price') ? (discount ? `Discount ${money(discount, unit?.currency)}` : 'Empty keeps the list price.') : 'Only a sales manager can agree a price.'}>
            <MoneyInput value={d.agreedPriceMinor} disabled={!can('deal.price')} onChange={(v) => setD({ ...d, agreedPriceMinor: v })} />
          </Field>
          <Field label="Reservation amount"><MoneyInput value={d.reservationAmountMinor} onChange={(v) => setD({ ...d, reservationAmountMinor: v })} /></Field>
          <Field label="Payment plan"><Select value={d.paymentPlanId} onChange={(e) => setD({ ...d, paymentPlanId: e.target.value })} placeholder="Not chosen" options={(plans ?? []).map((p) => ({ value: p.id, label: p.name }))} /></Field>
          <Field label="Expected close"><Input type="date" value={d.expectedCloseAt} onChange={(e) => setD({ ...d, expectedCloseAt: e.target.value })} /></Field>
        </div>
        <Field label="Notes"><Textarea rows={2} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

// ─── Viewings ────────────────────────────────────────────────────────────

/** After a viewing: how it went, and the next step. */
export function ViewingFeedbackModal({ viewing, onClose }: { viewing: { id: string; name: string; units: { id: string; code: string }[] }; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState({ status: 'COMPLETED', interestLevel: '', outcome: '', objections: '', alternativeUnitId: '', next: true, nextTitle: `Follow up after viewing — ${viewing.name.split(' ')[0]}`, nextDue: localDateTime(presetDue('tomorrow')) });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await post(`/admin/viewings/${viewing.id}/feedback`, {
        status: d.status,
        ...(d.status === 'COMPLETED' ? { interestLevel: d.interestLevel || undefined, outcome: d.outcome || null, objections: d.objections || null, alternativeUnitId: d.alternativeUnitId || null } : {}),
        ...(d.next && d.nextTitle.trim() ? { next: { title: d.nextTitle, type: 'POST_VIEWING', dueAt: d.nextDue ? new Date(d.nextDue).toISOString() : null } } : {}),
      });
      toast.success(d.status === 'NO_SHOW' ? 'Recorded as a no-show.' : 'Feedback saved — the lead moved to Viewing completed.');
      refreshCrm();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="How did the viewing go?" sub={`${viewing.name}${viewing.units.length ? ` · ${viewing.units.map((u) => fmtCode(u.code)).join(', ')}` : ''}`} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} disabled={d.status === 'COMPLETED' && !d.interestLevel} onClick={() => void save()}>Save feedback</Button></>}>
      <div className="stack-sm">
        <div className="segmented" role="group">
          <button type="button" aria-pressed={d.status === 'COMPLETED'} onClick={() => setD({ ...d, status: 'COMPLETED' })}>They came</button>
          <button type="button" aria-pressed={d.status === 'NO_SHOW'} onClick={() => setD({ ...d, status: 'NO_SHOW', nextTitle: `Reschedule viewing — ${viewing.name.split(' ')[0]}` })}>No-show</button>
        </div>
        {d.status === 'COMPLETED' && (
          <>
            <Field label="Customer interest">
              <div className="choice-grid">
                {VIEWING_INTERESTS.map((k) => (
                  <button key={k} type="button" aria-pressed={d.interestLevel === k} onClick={() => setD({ ...d, interestLevel: k })}>{VIEWING_INTEREST_LABEL[k]}</button>
                ))}
              </div>
            </Field>
            <Field label="Feedback"><Textarea rows={2} value={d.outcome} placeholder="Loved the terrace; asked about service charges." onChange={(e) => setD({ ...d, outcome: e.target.value })} /></Field>
            <Field label="Objections"><Input value={d.objections} placeholder="Price, completion date, parking…" onChange={(e) => setD({ ...d, objections: e.target.value })} /></Field>
            {(d.interestLevel === 'WANTS_ANOTHER' || d.alternativeUnitId) && (
              <Field label="Residence they would rather have"><UnitPicker value={d.alternativeUnitId} onChange={(v) => setD({ ...d, alternativeUnitId: v })} onlyOpen /></Field>
            )}
          </>
        )}
        <Checkbox checked={d.next} onChange={(v) => setD({ ...d, next: v })} label="Set the next action" />
        {d.next && (
          <div className="grid-2">
            <Field label="Next action"><Input value={d.nextTitle} onChange={(e) => setD({ ...d, nextTitle: e.target.value })} /></Field>
            <Field label="Due"><Input type="datetime-local" value={d.nextDue} onChange={(e) => setD({ ...d, nextDue: e.target.value })} /></Field>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── Layout helpers ──────────────────────────────────────────────────────

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="section-title">
      <h3>{children}</h3>
      {action}
    </div>
  );
}

/** A slim horizontal bar for report tables. */
export function Meter({ value, max, tone = 'sky' }: { value: number; max: number; tone?: string }) {
  const pct = useMemo(() => (max ? Math.max(value ? 3 : 0, (value / max) * 100) : 0), [value, max]);
  return (
    <span className="meter" aria-hidden="true">
      <i className={`tone-${tone}`} style={{ width: `${pct}%` }} />
    </span>
  );
}
