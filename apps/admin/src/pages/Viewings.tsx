import { useMemo, useState } from 'react';
import { CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, Clock, Mail, Phone, Plus } from 'lucide-react';
import { VIEWING_SLOTS, VIEWING_STATUS_LABEL, type ViewingStatusValue } from '@avida/types';
import { get, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { code as fmtCode, date, dateTime } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { useTeam } from '../lib/ref';
import { Link, useSearchState } from '../lib/router';
import { useToast } from '../components/Toast';
import { Alert, Badge, Button, Card, CardHead, Drawer, Empty, ErrorBox, Field, Input, LoadingPage, Modal, NumberInput, PageHead, Select, Skeleton, Textarea } from '../components/ui';

interface Viewing {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: ViewingStatusValue;
  requestedDate: string | null;
  requestedSlot: string | null;
  scheduledAt: string | null;
  durationMinutes: number;
  location: string | null;
  notes: string | null;
  outcome: string | null;
  agentId: string | null;
  agent: { id: string; name: string } | null;
  enquiry: { id: string; status: string } | null;
  units: { id: string; code: string }[];
  confirmationSentAt: string | null;
  reminderSentAt: string | null;
  notifications?: { id: string; kind: string; status: string; recipient: string; sentAt: string | null; lastError: string | null }[];
}

interface CalendarData {
  scheduled: Viewing[];
  requests: Viewing[];
  counts: Record<string, number>;
}

const TONE: Record<ViewingStatusValue, string> = { REQUESTED: 'amber', CONFIRMED: 'green', COMPLETED: 'teal', NO_SHOW: 'red', CANCELLED: 'grey' };
const slotLabel = (k: string | null) => VIEWING_SLOTS.find((s) => s.key === k)?.label ?? '';

/** `YYYY-MM-DDTHH:mm` in the browser's time, for a datetime-local input. */
function localInput(iso: string | null | undefined, fallbackDay?: string | null, slot?: string | null): string {
  const d = iso ? new Date(iso) : fallbackDay ? new Date(fallbackDay) : null;
  if (!d) return '';
  if (!iso) d.setHours(slot === 'AFTERNOON' ? 14 : slot === 'EVENING' ? 16 : 10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Book a viewing: from a lead (pre-filled) or for someone who phoned. */
export function ViewingForm({ enquiryId, unitIds, onClose }: { enquiryId?: string; unitIds?: string[]; onClose: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const { data: team } = useTeam();
  const [d, setD] = useState({ name: '', email: '', phone: '', scheduledAt: '', durationMinutes: 45, agentId: user?.id ?? '', location: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await post('/admin/viewings', {
        ...(enquiryId ? { enquiryId } : { name: d.name, email: d.email, phone: d.phone }),
        unitIds,
        scheduledAt: d.scheduledAt ? new Date(d.scheduledAt).toISOString() : null,
        durationMinutes: d.durationMinutes,
        agentId: d.agentId || null,
        location: d.location || null,
        notes: d.notes || null,
      });
      toast.success(d.scheduledAt ? 'Viewing booked. The confirmation email is on its way.' : 'Viewing request saved.');
      invalidate('viewings', 'enquiries', 'sales-desk');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Book a viewing" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} disabled={!enquiryId && (!d.name || !d.email || !d.phone)} onClick={() => void save()}>{d.scheduledAt ? 'Book and confirm' : 'Save request'}</Button></>}>
      {!enquiryId && (
        <div className="grid-2">
          <Field label="Name"><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} autoFocus /></Field>
          <Field label="Phone"><Input value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} /></Field>
          <Field label="Email" className="full"><Input type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} /></Field>
        </div>
      )}
      <div className="grid-2">
        <Field label="When" hint="Empty keeps it as a request to schedule later."><Input type="datetime-local" value={d.scheduledAt} onChange={(e) => setD({ ...d, scheduledAt: e.target.value })} /></Field>
        <Field label="Length"><NumberInput value={d.durationMinutes} suffix="min" onChange={(v) => setD({ ...d, durationMinutes: v ?? 45 })} /></Field>
        <Field label="Agent"><Select value={d.agentId} onChange={(e) => setD({ ...d, agentId: e.target.value })} placeholder="Unassigned" options={(team ?? []).map((t) => ({ value: t.id, label: t.name }))} /></Field>
        <Field label="Where"><Input value={d.location} placeholder="Sales gallery, on site…" onChange={(e) => setD({ ...d, location: e.target.value })} /></Field>
      </div>
      <Field label="Notes"><Textarea rows={2} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></Field>
    </Modal>
  );
}

function ViewingDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data: team } = useTeam();
  const { data: v, error } = useQuery(`viewings:detail:${id}`, () => get<Viewing>(`/admin/viewings/${id}`));
  const [when, setWhen] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const editable = can('enquiry.edit');
  const update = async (body: Record<string, unknown>, msg: string) => {
    try {
      await patch(`/admin/viewings/${id}`, body);
      toast.success(msg);
      invalidate('viewings', 'enquiries', 'sales-desk');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  if (error) return <Drawer title="Viewing" onClose={onClose}><ErrorBox error={error} /></Drawer>;
  if (!v) return <Drawer title="Viewing" onClose={onClose}><Skeleton h={200} /></Drawer>;
  const whenValue = when ?? localInput(v.scheduledAt, v.requestedDate, v.requestedSlot);
  const open = v.status === 'REQUESTED' || v.status === 'CONFIRMED';

  return (
    <Drawer
      title={v.name}
      sub={<Badge tone={TONE[v.status]}>{VIEWING_STATUS_LABEL[v.status]}</Badge>}
      onClose={onClose}
      footer={
        editable &&
        open && (
          <>
            {v.status === 'CONFIRMED' && <Button variant="primary" onClick={() => void update({ status: 'COMPLETED', outcome: outcome ?? v.outcome }, 'Viewing completed — the lead moves to Viewed.')}>Mark completed</Button>}
            {v.status === 'CONFIRMED' && <Button onClick={() => void update({ status: 'NO_SHOW' }, 'Recorded as a no-show.')}>No-show</Button>}
            <span className="spacer" />
            <Button variant="ghost" onClick={() => void update({ status: 'CANCELLED' }, 'Viewing cancelled.')}>Cancel viewing</Button>
          </>
        )
      }
    >
      <div className="stack">
        <div className="lead-contact">
          <a className="btn btn-sm" href={`tel:${v.phone}`}><Phone size={14} /> {v.phone}</a>
          <a className="btn btn-sm" href={`mailto:${v.email}`}><Mail size={14} /> {v.email}</a>
          {v.enquiry && <Link className="btn btn-sm" to={`/enquiries?open=${v.enquiry.id}`}>Open the lead</Link>}
        </div>
        {v.status === 'REQUESTED' && (
          <Alert tone="warn" icon={<Clock size={18} />}>
            Asked for {v.requestedDate ? date(v.requestedDate) : 'any day'}{v.requestedSlot ? `, ${slotLabel(v.requestedSlot).toLowerCase()}` : ''}. Choose a time and an agent to confirm — they get a confirmation email, and a reminder the day before.
          </Alert>
        )}
        <div className="grid-2">
          <Field label="Date and time">
            <Input type="datetime-local" disabled={!editable || !open} value={whenValue} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          <Field label="Agent">
            <Select value={v.agentId ?? ''} disabled={!editable} onChange={(e) => void update({ agentId: e.target.value || null }, 'Agent changed.')} placeholder="Unassigned" options={(team ?? []).map((t) => ({ value: t.id, label: t.name }))} />
          </Field>
          <Field label="Where">
            <Input defaultValue={v.location ?? ''} disabled={!editable} onBlur={(e) => e.target.value !== (v.location ?? '') && void update({ location: e.target.value || null }, 'Location saved.')} />
          </Field>
          <Field label="Length">
            <NumberInput defaultValue={v.durationMinutes} suffix="min" disabled={!editable} onBlur={(e) => Number(e.target.value) !== v.durationMinutes && void update({ durationMinutes: Number(e.target.value) }, 'Saved.')} />
          </Field>
        </div>
        {editable && open && when !== null && when !== localInput(v.scheduledAt) && (
          <Button variant="primary" icon={<CalendarCheck size={15} />} onClick={() => { void update({ scheduledAt: new Date(whenValue).toISOString(), status: 'CONFIRMED' }, v.status === 'CONFIRMED' ? 'Rescheduled — a new confirmation is on its way.' : 'Confirmed — the confirmation email is on its way.'); setWhen(null); }}>
            {v.status === 'CONFIRMED' ? 'Reschedule and notify' : 'Confirm and notify'}
          </Button>
        )}
        {v.units.length > 0 && <p className="small">Residences: {v.units.map((u) => fmtCode(u.code)).join(', ')}</p>}
        {v.notes && <p className="quote">{v.notes}</p>}
        <Field label="Outcome" hint="What they thought, and what happens next.">
          <Textarea rows={3} disabled={!editable} defaultValue={v.outcome ?? ''} onChange={(e) => setOutcome(e.target.value)} onBlur={(e) => e.target.value !== (v.outcome ?? '') && void update({ outcome: e.target.value || null }, 'Outcome saved.')} />
        </Field>
        <div className="small muted">
          {v.confirmationSentAt ? `Confirmation sent ${dateTime(v.confirmationSentAt)}.` : 'No confirmation sent yet.'} {v.reminderSentAt ? `Reminder sent ${dateTime(v.reminderSentAt)}.` : ''}
        </div>
      </div>
    </Drawer>
  );
}

const startOfWeek = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};

/** §15.2 — the viewings calendar. */
export default function Viewings() {
  const { can } = useAuth();
  const [s, set] = useSearchState();
  const [booking, setBooking] = useState(false);
  const week = useMemo(() => {
    const base = s.week ? new Date(`${s.week}T00:00:00`) : new Date();
    return startOfWeek(Number.isNaN(base.getTime()) ? new Date() : base);
  }, [s.week]);
  const end = new Date(week.getTime() + 7 * 86_400_000);
  const key = `viewings:${week.toISOString()}:${s.agentId ?? ''}`;
  const { data, error, refetch } = useQuery(key, () => get<CalendarData>(`/admin/viewings?from=${week.toISOString()}&to=${end.toISOString()}${s.agentId ? `&agentId=${s.agentId}` : ''}`));
  const { data: team } = useTeam();
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data) return <LoadingPage />;

  const days = Array.from({ length: 7 }, (_, i) => new Date(week.getTime() + i * 86_400_000));
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const shift = (n: number) => set({ week: iso(new Date(week.getTime() + n * 7 * 86_400_000)) });
  const today = iso(new Date());

  return (
    <>
      <PageHead title="Viewings" sub={`${data.requests.length} waiting for a time · ${data.scheduled.filter((v) => v.status === 'CONFIRMED').length} confirmed this week`}>
        {can('enquiry.edit') && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setBooking(true)}>Book a viewing</Button>}
      </PageHead>

      {data.requests.length > 0 && (
        <Card>
          <CardHead title="Waiting for a time" icon={<Clock size={18} />} sub="Requests from the website — confirm each within one working day" />
          {data.requests.map((v) => (
            <button key={v.id} type="button" className="row list-row" onClick={() => set({ open: v.id }, { replace: false })}>
              <Badge tone="amber">Requested</Badge>
              <strong style={{ flex: 1, textAlign: 'left' }}>{v.name}</strong>
              <span className="small">{v.requestedDate ? date(v.requestedDate) : 'Any day'}{v.requestedSlot ? ` · ${slotLabel(v.requestedSlot)}` : ''}</span>
              <span className="small muted">{v.units.map((u) => fmtCode(u.code)).join(', ')}</span>
            </button>
          ))}
        </Card>
      )}

      <Card>
        <CardHead title={`${date(week)} – ${date(new Date(end.getTime() - 1))}`} icon={<CalendarDays size={18} />}>
          <Select className="sm" style={{ width: 'auto' }} value={s.agentId ?? ''} onChange={(e) => set({ agentId: e.target.value })} placeholder="Every agent" options={(team ?? []).map((t) => ({ value: t.id, label: t.name }))} />
          <Button size="sm" variant="ghost" icon={<ChevronLeft size={16} />} aria-label="Previous week" onClick={() => shift(-1)} />
          <Button size="sm" onClick={() => set({ week: null })}>This week</Button>
          <Button size="sm" variant="ghost" icon={<ChevronRight size={16} />} aria-label="Next week" onClick={() => shift(1)} />
        </CardHead>
        <div className="calendar-week">
          {days.map((d) => {
            const items = data.scheduled.filter((v) => v.scheduledAt && iso(new Date(v.scheduledAt)) === iso(d));
            return (
              <section key={iso(d)} className="calendar-day" data-today={iso(d) === today ? 'true' : undefined} aria-label={date(d)}>
                <header>
                  <span>{new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(d)}</span>
                  <strong>{d.getDate()}</strong>
                </header>
                {items.length === 0 && <p className="faint small">—</p>}
                {items.map((v) => (
                  <button key={v.id} type="button" className="calendar-event" data-status={v.status} onClick={() => set({ open: v.id }, { replace: false })}>
                    <span className="tabular">{new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(v.scheduledAt!))}</span>
                    <strong>{v.name}</strong>
                    <span className="small">{v.units.map((u) => fmtCode(u.code)).join(', ')}{v.agent ? ` · ${v.agent.name}` : ''}</span>
                    {v.status !== 'CONFIRMED' && <Badge tone={TONE[v.status]} plain>{VIEWING_STATUS_LABEL[v.status]}</Badge>}
                  </button>
                ))}
              </section>
            );
          })}
        </div>
        {data.scheduled.length === 0 && <Empty title="No viewings this week" icon={<CalendarDays size={28} />} />}
      </Card>

      {s.open && <ViewingDrawer id={s.open} onClose={() => set({ open: null })} />}
      {booking && <ViewingForm onClose={() => setBooking(false)} />}
    </>
  );
}
