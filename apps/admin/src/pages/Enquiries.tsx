import { useEffect, useState } from 'react';
import { AlarmClock, CalendarPlus, CheckSquare, Download, Handshake, Inbox, KeyRound, Mail, MessageCircle, Phone, ShieldAlert, UserPlus } from 'lucide-react';
import {
  ENQUIRY_STATUSES,
  humanise,
  LEAD_NOTE_KINDS,
  LEAD_NOTE_LABEL,
  LOST_REASON_LABEL,
  LOST_REASONS,
  NOTIFICATION_KIND_LABEL,
  PIPELINE_STAGES,
  STAGE_LABEL,
  VIEWING_SLOTS,
  VIEWING_STATUS_LABEL,
} from '@avida/types';
import { downloadUrl, get, patch, post, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago, code as fmtCode, date, dateTime, ENQUIRY_TONE, money } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { useTeam } from '../lib/ref';
import { Link, useDebounced, useSearchState } from '../lib/router';
import type { Paged } from '../lib/types';
import { useToast } from '../components/Toast';
import { Alert, Badge, Button, Card, Checkbox, Drawer, Empty, ErrorBox, Field, Input, KV, Modal, PageHead, Pagination, Segmented, Select, Skeleton, Textarea } from '../components/ui';
import { ViewingForm } from './Viewings';
import { ReservationForm } from './Reservations';

export interface LeadRow {
  id: string;
  createdAt: string;
  name: string;
  email: string;
  phone: string;
  countryIso: string | null;
  intent: string;
  status: string;
  source: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  followUpAt: string | null;
  contactedAt: string | null;
  lastActivityAt: string | null;
  repeatCount: number;
  noteCount: number;
  overdue: boolean;
  verificationSkipped: boolean;
  openViewing: { id: string; status: string; scheduledAt: string | null; requestedDate: string | null } | null;
  buyer: { id: string; fullName: string } | null;
  units: { id: string; code: string; priceMinor: number; currency: string; status: string }[];
}

interface LeadDetail extends LeadRow {
  message: string | null;
  lostReason: string | null;
  lostNote: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  landingPath: string | null;
  referrer: string | null;
  notes: { id: string; kind: string; body: string; createdAt: string; authorName: string }[];
  viewings: { id: string; status: string; scheduledAt: string | null; requestedDate: string | null; requestedSlot: string | null; agent: { name: string } | null; units: string[] }[];
  reservations: { id: string; status: string; heldUntil: string; unit: { code: string } }[];
  notifications: { id: string; kind: string; recipient: string; status: string; lastError: string | null; sentAt: string | null; createdAt: string }[];
  otherEnquiries: { id: string; createdAt: string; status: string }[];
}

export interface ListData extends Paged<LeadRow> {
  byStatus: Record<string, number>;
  overdue: number;
  mine: number;
}

const whatsapp = (phone: string) => `https://wa.me/${phone.replace(/\D/g, '')}`;
const toLocalInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

function LostModal({ onConfirm, onClose, count = 1 }: { onConfirm: (reason: string, note: string) => void; onClose: () => void; count?: number }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  return (
    <Modal title={count > 1 ? `Mark ${count} leads as lost` : 'Mark as lost'} sub="The reason is what the reports learn from." onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!reason} onClick={() => onConfirm(reason, note)}>Mark as lost</Button></>}>
      <Field label="Why?">
        <Select value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Choose a reason" options={LOST_REASONS.map((r) => ({ value: r, label: LOST_REASON_LABEL[r] }))} />
      </Field>
      {count === 1 && <Field label="Anything to add (optional)"><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>}
    </Modal>
  );
}

export function LeadDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data: team } = useTeam();
  const { data: e, error } = useQuery(`enquiries:detail:${id}`, () => get<LeadDetail>(`/admin/enquiries/${id}`));
  const [kind, setKind] = useState<string>('CALL');
  const [body, setBody] = useState('');
  const [lost, setLost] = useState(false);
  const [booking, setBooking] = useState(false);
  const [reserving, setReserving] = useState(false);
  const editable = can('enquiry.edit');
  const refresh = () => invalidate('enquiries', 'dashboard', 'sales-desk', 'viewings', 'reservations');

  const update = async (payload: Record<string, unknown>, msg = 'Saved.') => {
    try {
      await patch(`/admin/enquiries/${id}`, payload);
      toast.success(msg);
      refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };
  const addNote = async () => {
    try {
      await post(`/admin/enquiries/${id}/notes`, { kind, body });
      setBody('');
      toast.success(`${LEAD_NOTE_LABEL[kind]} logged.`);
      refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Drawer
      title={e?.name ?? 'Lead'}
      sub={e && `${humanise(e.intent)} · ${dateTime(e.createdAt)}${e.repeatCount ? ` · asked ${e.repeatCount + 1} times` : ''}`}
      onClose={onClose}
      footer={
        e &&
        editable && (
          <>
            {!e.buyer && can('buyer.edit') && e.status !== 'SPAM' && (
              <Button icon={<Handshake size={15} />} onClick={async () => { try { await post(`/admin/enquiries/${id}/convert`); toast.success('Client record created.'); refresh(); } catch (err) { toast.error((err as Error).message); } }}>Make client</Button>
            )}
            <Button icon={<CalendarPlus size={15} />} onClick={() => setBooking(true)}>Book viewing</Button>
            {can('reservation.edit') && e.units.some((u) => u.status === 'AVAILABLE') && <Button icon={<KeyRound size={15} />} onClick={() => setReserving(true)}>Reserve</Button>}
            <span className="spacer" />
            {e.status !== 'SPAM' && <Button variant="ghost" icon={<ShieldAlert size={15} />} onClick={() => void update({ status: 'SPAM' }, 'Marked as spam.')}>Spam</Button>}
          </>
        )
      }
    >
      {error && <ErrorBox error={error} />}
      {!e && !error && <Skeleton h={200} />}
      {e && (
        <div className="stack">
          {e.overdue && <Alert tone="warn" icon={<AlarmClock size={18} />}>{e.contactedAt ? 'The follow-up date has passed.' : 'No one has answered this lead yet — the website promises a reply within one working day.'}</Alert>}
          {e.verificationSkipped && <Alert tone="warn">The anti-spam check was unavailable when this arrived. Treat with care.</Alert>}

          <div className="lead-contact">
            <a className="btn btn-sm" href={`tel:${e.phone}`} onClick={() => editable && !e.contactedAt && void post(`/admin/enquiries/${id}/notes`, { kind: 'CALL', body: 'Called from the lead desk.' }).then(refresh)}><Phone size={14} /> {e.phone}</a>
            <a className="btn btn-sm" href={whatsapp(e.phone)} target="_blank" rel="noreferrer"><MessageCircle size={14} /> WhatsApp</a>
            <a className="btn btn-sm" href={`mailto:${e.email}`}><Mail size={14} /> {e.email}</a>
          </div>

          <div className="grid-2">
            <Field label="Stage">
              <Select
                value={e.status}
                disabled={!editable}
                onChange={(ev) => (ev.target.value === 'LOST' ? setLost(true) : void update({ status: ev.target.value }, `Moved to ${STAGE_LABEL[ev.target.value]}.`))}
                options={ENQUIRY_STATUSES.map((s) => ({ value: s, label: STAGE_LABEL[s] ?? humanise(s) }))}
              />
            </Field>
            <Field label="Owner">
              <Select value={e.assignedToId ?? ''} disabled={!editable} onChange={(ev) => void update({ assignedToId: ev.target.value || null }, 'Owner changed.')} placeholder="Unassigned" options={(team ?? []).map((t) => ({ value: t.id, label: t.name }))} />
            </Field>
            <Field label="Next follow-up">
              <Input type="date" disabled={!editable} defaultValue={toLocalInput(e.followUpAt)} key={e.followUpAt ?? 'none'} onChange={(ev) => void update({ followUpAt: ev.target.value ? new Date(`${ev.target.value}T09:00:00`).toISOString() : null }, ev.target.value ? `Follow-up set for ${date(ev.target.value)}.` : 'Follow-up cleared.')} />
            </Field>
            <Field label="First response">
              <div className="small" style={{ paddingTop: 8 }}>{e.contactedAt ? `${dateTime(e.contactedAt)} (${ago(e.contactedAt)})` : <Badge tone="amber">Not yet</Badge>}</div>
            </Field>
          </div>
          {e.status === 'LOST' && e.lostReason && <Alert tone="info">Lost — {LOST_REASON_LABEL[e.lostReason as keyof typeof LOST_REASON_LABEL]}{e.lostNote ? `: ${e.lostNote}` : ''}</Alert>}

          {e.units.length > 0 && (
            <div>
              <div className="field-label">Residences asked about</div>
              <div className="row-wrap" style={{ gap: 6, marginTop: 6 }}>
                {e.units.map((u) => (
                  <Link key={u.id} to={`/residences/${u.id}`} className="chip-link">
                    <strong>{fmtCode(u.code)}</strong> {money(u.priceMinor, u.currency)} <Badge tone="grey" plain>{humanise(u.status)}</Badge>
                  </Link>
                ))}
              </div>
            </div>
          )}
          {e.message && (
            <div>
              <div className="field-label">Their message</div>
              <p className="quote">{e.message}</p>
            </div>
          )}

          <div>
            <div className="field-label">Viewings</div>
            {e.viewings.length === 0 && <p className="muted small">None booked.</p>}
            {e.viewings.map((v) => (
              <div key={v.id} className="row" style={{ padding: '6px 0', borderTop: '1px solid var(--line-2)' }}>
                <Badge tone={v.status === 'CONFIRMED' ? 'green' : v.status === 'REQUESTED' ? 'amber' : 'grey'}>{VIEWING_STATUS_LABEL[v.status as keyof typeof VIEWING_STATUS_LABEL]}</Badge>
                <span className="small" style={{ flex: 1 }}>
                  {v.scheduledAt ? dateTime(v.scheduledAt) : `Asked for ${v.requestedDate ? date(v.requestedDate) : 'any day'}${v.requestedSlot ? `, ${VIEWING_SLOTS.find((s) => s.key === v.requestedSlot)?.label}` : ''}`}
                  {v.agent ? ` · ${v.agent.name}` : ''}
                </span>
                <Link to={`/viewings?open=${v.id}`} className="small">Open</Link>
              </div>
            ))}
          </div>

          {e.reservations.length > 0 && (
            <div>
              <div className="field-label">Reservations</div>
              {e.reservations.map((r) => (
                <div key={r.id} className="row small" style={{ padding: '6px 0' }}>
                  <strong>{fmtCode(r.unit.code)}</strong> <Badge tone={r.status === 'ACTIVE' ? 'orange' : 'grey'} plain>{humanise(r.status)}</Badge> until {date(r.heldUntil)}
                </div>
              ))}
            </div>
          )}

          <div>
            <div className="field-label">History</div>
            {editable && (
              <div className="note-composer">
                <Segmented value={kind} onChange={setKind} options={LEAD_NOTE_KINDS.map((k) => ({ value: k, label: LEAD_NOTE_LABEL[k] }))} />
                <Textarea rows={2} placeholder={kind === 'CALL' ? 'What was said, and what happens next…' : 'Add to the history…'} value={body} onChange={(ev) => setBody(ev.target.value)} />
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <Button size="sm" variant="primary" disabled={!body.trim()} onClick={() => void addNote()}>Log {(LEAD_NOTE_LABEL[kind] ?? humanise(kind)).toLowerCase()}</Button>
                </div>
              </div>
            )}
            <ol className="timeline">
              {e.notes.map((n) => (
                <li key={n.id} data-kind={n.kind}>
                  <div className="timeline-head"><Badge tone={n.kind === 'STATUS' ? 'sky' : n.kind === 'SYSTEM' ? 'grey' : 'teal'} plain>{LEAD_NOTE_LABEL[n.kind] ?? n.kind}</Badge> <span className="muted small">{n.authorName} · {ago(n.createdAt)}</span></div>
                  <p>{n.body}</p>
                </li>
              ))}
              <li data-kind="SYSTEM">
                <div className="timeline-head"><Badge tone="grey" plain>Received</Badge> <span className="muted small">{dateTime(e.createdAt)}</span></div>
                <p className="small muted">From {e.source ?? 'the website'}{e.utmSource ? ` · ${e.utmSource}${e.utmMedium ? `/${e.utmMedium}` : ''}${e.utmCampaign ? ` · ${e.utmCampaign}` : ''}` : ''}{e.landingPath ? ` · landed on ${e.landingPath}` : ''}</p>
              </li>
            </ol>
          </div>

          <div>
            <div className="field-label">Emails</div>
            {e.notifications.length === 0 && <p className="muted small">None.</p>}
            {e.notifications.map((n) => (
              <div key={n.id} className="row small" style={{ padding: '4px 0' }}>
                <Badge tone={n.status === 'SENT' ? 'green' : n.status === 'QUEUED' ? 'sky' : 'red'} plain>{humanise(n.status)}</Badge>
                <span style={{ flex: 1 }}>{NOTIFICATION_KIND_LABEL[n.kind] ?? n.kind} → {n.recipient}</span>
                {n.lastError && <span className="muted" title={n.lastError}>{n.lastError.slice(0, 40)}</span>}
              </div>
            ))}
          </div>

          <KV items={[['Country', e.countryIso ?? '—'], ['Client', e.buyer ? <Link to={`/buyers/${e.buyer.id}`}>{e.buyer.fullName}</Link> : '—'], ['Other enquiries', e.otherEnquiries.length ? `${e.otherEnquiries.length} from the same email or phone` : 'None']]} />
        </div>
      )}
      {lost && <LostModal onClose={() => setLost(false)} onConfirm={(reason, note) => { setLost(false); void update({ status: 'LOST', lostReason: reason, lostNote: note || null }, 'Marked as lost.'); }} />}
      {booking && e && <ViewingForm enquiryId={e.id} unitIds={e.units.map((u) => u.id)} onClose={() => setBooking(false)} />}
      {reserving && e && <ReservationForm enquiryId={e.id} unitId={e.units.find((u) => u.status === 'AVAILABLE')?.id} onClose={() => setReserving(false)} />}
    </Drawer>
  );
}

/** §40.3 — the lead desk. */
export default function Enquiries() {
  const { can } = useAuth();
  const toast = useToast();
  const { data: team } = useTeam();
  const [s, set] = useSearchState({ page: '1' });
  const [q, setQ] = useState(s.q ?? '');
  const term = useDebounced(q);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLost, setBulkLost] = useState(false);
  useEffect(() => {
    if ((s.q ?? '') !== term) set({ q: term, page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);
  const query = qs({ status: s.status, q: s.q, assignedTo: s.assignedTo, overdue: s.overdue, intent: s.intent, page: s.page });
  const { data, error, refetch } = useQuery(`enquiries:${query}`, () => get<ListData>(`/admin/enquiries${query}`));
  const editable = can('enquiry.edit');

  const bulk = async (payload: Record<string, unknown>, msg: string) => {
    try {
      await post('/admin/enquiries/bulk', { ids: [...selected], ...payload });
      toast.success(msg);
      setSelected(new Set());
      invalidate('enquiries', 'dashboard', 'sales-desk');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };
  const rows = data?.data ?? [];
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const total = data ? Object.entries(data.byStatus).filter(([k]) => k !== 'SPAM').reduce((a, [, n]) => a + n, 0) : 0;

  return (
    <>
      <PageHead title="Enquiries" sub={data ? `${total} leads · ${data.overdue} overdue · ${data.mine} yours` : 'Every enquiry from the website'}>
        {can('enquiry.export') && <a className="btn" href={downloadUrl('/admin/enquiries/export.csv')}><Download size={15} /> Export CSV</a>}
      </PageHead>

      {data && (
        <div className="pipeline" role="group" aria-label="Pipeline stages">
          <button type="button" className={!s.status ? 'active' : undefined} onClick={() => set({ status: null, page: 1 })}><span>All open</span><strong>{total}</strong></button>
          {PIPELINE_STAGES.map((st) => (
            <button key={st} type="button" className={s.status === st ? 'active' : undefined} onClick={() => set({ status: st, page: 1 })} data-tone={ENQUIRY_TONE[st]}>
              <span>{STAGE_LABEL[st]}</span>
              <strong>{data.byStatus[st] ?? 0}</strong>
            </button>
          ))}
          <button type="button" className={s.status === 'LOST' ? 'active' : undefined} onClick={() => set({ status: 'LOST', page: 1 })}><span>Lost</span><strong>{data.byStatus.LOST ?? 0}</strong></button>
        </div>
      )}

      <Card>
        <div className="toolbar">
          <Input placeholder="Search name, email, phone or message" value={q} onChange={(ev) => setQ(ev.target.value)} style={{ maxWidth: 320 }} />
          <Select className="sm" style={{ width: 'auto' }} value={s.assignedTo ?? ''} onChange={(ev) => set({ assignedTo: ev.target.value, page: 1 })} placeholder="Anyone" options={[{ value: 'me', label: 'Mine' }, { value: 'none', label: 'Unassigned' }, ...(team ?? []).map((t) => ({ value: t.id, label: t.name }))]} />
          <Select className="sm" style={{ width: 'auto' }} value={s.intent ?? ''} onChange={(ev) => set({ intent: ev.target.value, page: 1 })} placeholder="Any request" options={[{ value: 'VIEWING', label: 'Viewings' }, { value: 'INFORMATION', label: 'Information' }, { value: 'RESERVATION', label: 'Reservations' }, { value: 'BROKER', label: 'Brokers' }]} />
          <Button size="sm" variant={s.overdue === 'true' ? 'primary' : 'default'} icon={<AlarmClock size={14} />} onClick={() => set({ overdue: s.overdue === 'true' ? null : 'true', page: 1 })}>Overdue{data ? ` (${data.overdue})` : ''}</Button>
          <Button size="sm" variant="ghost" onClick={() => set({ status: s.status === 'SPAM' ? null : 'SPAM', page: 1 })}>{s.status === 'SPAM' ? 'Hide spam' : 'Spam'}</Button>
        </div>

        {editable && selected.size > 0 && (
          <div className="bulk-bar">
            <CheckSquare size={16} /> <strong>{selected.size} selected</strong>
            <Select className="sm" style={{ width: 'auto' }} value="" onChange={(ev) => ev.target.value && void bulk({ action: 'assign', assignedToId: ev.target.value === 'none' ? null : ev.target.value }, 'Leads assigned.')} placeholder="Assign to…" options={[{ value: 'none', label: 'Nobody' }, ...(team ?? []).map((t) => ({ value: t.id, label: t.name }))]} />
            <Select className="sm" style={{ width: 'auto' }} value="" onChange={(ev) => (ev.target.value === 'LOST' ? setBulkLost(true) : ev.target.value && void bulk({ action: 'status', status: ev.target.value }, `Moved to ${STAGE_LABEL[ev.target.value] ?? humanise(ev.target.value)}.`))} placeholder="Move to…" options={ENQUIRY_STATUSES.filter((x) => x !== 'SPAM').map((x) => ({ value: x, label: STAGE_LABEL[x] ?? humanise(x) }))} />
            <Button size="sm" variant="ghost" icon={<ShieldAlert size={14} />} onClick={() => void bulk({ action: 'spam' }, 'Marked as spam.')}>Spam</Button>
            <span className="spacer" />
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}

        {error && <ErrorBox error={error} onRetry={refetch} />}
        {!data && !error && <div className="card-body"><Skeleton h={220} /></div>}
        {data && rows.length === 0 && <Empty title="No enquiries match" icon={<Inbox size={32} />} />}
        {rows.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {editable && <th style={{ width: 36 }}><Checkbox checked={allChecked} aria-label="Select all" onChange={(v) => setSelected(v ? new Set(rows.map((r) => r.id)) : new Set())} /></th>}
                  <th>Lead</th>
                  <th>Asked about</th>
                  <th>Stage</th>
                  <th>Owner</th>
                  <th>Next</th>
                  <th>Received</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} data-overdue={r.overdue ? 'true' : undefined}>
                    {editable && <td><Checkbox checked={selected.has(r.id)} aria-label={`Select ${r.name}`} onChange={(v) => { const next = new Set(selected); if (v) next.add(r.id); else next.delete(r.id); setSelected(next); }} /></td>}
                    <td>
                      <button type="button" className="link-button" onClick={() => set({ open: r.id }, { replace: false })}>
                        <strong>{r.name}</strong>
                      </button>
                      <div className="muted small">{r.email}{r.repeatCount ? ` · ×${r.repeatCount + 1}` : ''}{r.noteCount ? ` · ${r.noteCount} notes` : ''}</div>
                    </td>
                    <td className="small">{r.units.length ? r.units.map((u) => fmtCode(u.code)).join(', ') : <span className="faint">{humanise(r.intent)}</span>}</td>
                    <td><Badge tone={ENQUIRY_TONE[r.status] ?? 'grey'}>{STAGE_LABEL[r.status] ?? r.status}</Badge></td>
                    <td className="small">{r.assignedToName ?? (editable ? <button type="button" className="link-button small" onClick={() => void bulk({ ids: [r.id], action: 'assign', assignedToId: null }, '') }><UserPlus size={13} /> Unassigned</button> : <span className="faint">Unassigned</span>)}</td>
                    <td className="small">
                      {r.overdue && <Badge tone="red" plain>Overdue</Badge>}{' '}
                      {r.openViewing ? `Viewing ${r.openViewing.scheduledAt ? dateTime(r.openViewing.scheduledAt) : 'requested'}` : r.followUpAt ? `Follow up ${date(r.followUpAt)}` : !r.contactedAt ? 'First response' : ''}
                    </td>
                    <td className="small muted">{ago(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.meta.pages > 1 && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(p) => set({ page: p })} />}
      </Card>
      {s.open && <LeadDrawer id={s.open} onClose={() => set({ open: null })} />}
      {bulkLost && <LostModal count={selected.size} onClose={() => setBulkLost(false)} onConfirm={(reason) => { setBulkLost(false); void bulk({ action: 'status', status: 'LOST', lostReason: reason }, 'Marked as lost.'); }} />}
    </>
  );
}
