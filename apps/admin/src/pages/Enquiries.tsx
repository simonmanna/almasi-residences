import { useEffect, useState } from 'react';
import { AlertTriangle, Download, Handshake, Inbox, Mail, Phone } from 'lucide-react';
import { ENQUIRY_STATUSES, humanise } from '@avida/types';
import { downloadUrl, get, patch, post, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago, code as fmtCode, dateTime, ENQUIRY_TONE, money } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { useTeam } from '../lib/ref';
import { Link, navigate, useDebounced, useSearchState } from '../lib/router';
import type { ActivityRow, Paged } from '../lib/types';
import { useToast } from '../components/Toast';
import { Alert, Badge, Button, Card, Drawer, Empty, ErrorBox, Field, Input, KV, PageHead, Pagination, Select, Skeleton, Tabs, Textarea } from '../components/ui';

interface EnquiryRow {
  id: string;
  createdAt: string;
  name: string;
  email: string;
  phone: string;
  countryIso: string | null;
  intent: string;
  status: string;
  message: string | null;
  source: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  verificationSkipped: boolean;
  buyer: { id: string; fullName: string } | null;
  units: { id: string; code: string; priceMinor: number; currency: string; status: string }[];
}

interface EnquiryDetail extends Omit<EnquiryRow, 'assignedToName'> {
  internalNote: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  landingPath: string | null;
  referrer: string | null;
  activity: ActivityRow[];
}

function EnquiryDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data: team } = useTeam();
  const { data: e, error } = useQuery(`enquiries:detail:${id}`, () => get<EnquiryDetail>(`/admin/enquiries/${id}`));
  const [note, setNote] = useState<string | null>(null);
  const editable = can('enquiry.edit');
  const update = async (body: Record<string, unknown>, msg = 'Saved.') => {
    try {
      await patch(`/admin/enquiries/${id}`, body);
      toast.success(msg);
      invalidate('enquiries', 'dashboard');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };
  return (
    <Drawer title={e?.name ?? 'Enquiry'} sub={e && `${humanise(e.intent)} · received ${dateTime(e.createdAt)}`} onClose={onClose}
      footer={e && editable && (
        e.buyer ? (
          <Link to={`/buyers/${e.buyer.id}`} className="btn"><Handshake size={15} /> Open client {e.buyer.fullName}</Link>
        ) : can('buyer.edit') ? (
          <Button variant="primary" icon={<Handshake size={15} />} onClick={async () => {
            try {
              const b = await post<{ id: string; fullName: string }>(`/admin/enquiries/${id}/convert`);
              toast.success(`Client ${b.fullName} created with their residences of interest.`);
              invalidate('enquiries', 'buyers');
              navigate(`/buyers/${b.id}`);
            } catch (err) {
              toast.error((err as Error).message);
            }
          }}>Convert to client</Button>
        ) : null
      )}
    >
      {error && <ErrorBox error={error} />}
      {!e && !error && <Skeleton h={200} />}
      {e && (
        <>
          {e.verificationSkipped && <Alert tone="warn" icon={<AlertTriangle size={17} />}>The anti-spam check could not run for this enquiry. Check it is genuine before replying.</Alert>}
          <div className="form-grid">
            <Field label="Status">
              <Select value={e.status} disabled={!editable} onChange={(ev) => void update({ status: ev.target.value }, `Status: ${humanise(ev.target.value)}.`)} options={ENQUIRY_STATUSES.map((s) => ({ value: s, label: humanise(s) }))} />
            </Field>
            <Field label="Assigned to">
              <Select value={e.assignedTo ?? ''} disabled={!editable} onChange={(ev) => void update({ assignedTo: ev.target.value || null })} placeholder="Unassigned" options={(team ?? []).map((t) => ({ value: t.id, label: t.name }))} />
            </Field>
          </div>
          <KV items={[
            [<span className="row" style={{ gap: 6 }}><Mail size={14} /> Email</span>, <a href={`mailto:${e.email}`}>{e.email}</a>],
            [<span className="row" style={{ gap: 6 }}><Phone size={14} /> Phone</span>, <a href={`tel:${e.phone}`}>{e.phone}</a>],
            ['Country', e.countryIso ?? '—'],
            ['Residences', e.units.length ? e.units.map((u) => <Link key={u.id} to={`/residences/${u.id}`} style={{ marginRight: 8 }}>{fmtCode(u.code)}</Link>) : 'General enquiry'],
            ['Source', [e.source, e.utmSource, e.utmMedium, e.utmCampaign].filter(Boolean).join(' · ') || '—'],
            ['Landing page', e.landingPath ?? '—'],
          ]} />
          {e.message && (
            <div>
              <div className="label" style={{ marginBottom: 6 }}>Message</div>
              <div className="alert info" style={{ whiteSpace: 'pre-line' }}>{e.message}</div>
            </div>
          )}
          <Field label="Internal note" hint="Private to the team.">
            <Textarea rows={3} disabled={!editable} value={note ?? e.internalNote ?? ''} onChange={(ev) => setNote(ev.target.value)} onBlur={() => note !== null && note !== (e.internalNote ?? '') && void update({ internalNote: note || null }, 'Note saved.')} />
          </Field>
          {e.activity.length > 0 && (
            <div className="stack-sm">
              <div className="label">History</div>
              {e.activity.map((a) => <div key={a.id} className="small"><strong>{a.summary}</strong> <span className="muted">— {a.actorName}, {ago(a.createdAt)}</span></div>)}
            </div>
          )}
        </>
      )}
    </Drawer>
  );
}

/** §14 — every enquiry the website receives, worked through its statuses. */
export default function Enquiries() {
  const { can } = useAuth();
  const toast = useToast();
  const [s, set] = useSearchState({ page: '1' });
  const [q, setQ] = useState(s.q ?? '');
  const term = useDebounced(q);
  useEffect(() => {
    if ((s.q ?? '') !== term) set({ q: term, page: 1 });
  }, [term, s.q, set]);
  const query = qs({ status: s.status, q: s.q, assignedTo: s.assignedTo, page: s.page });
  const { data, error } = useQuery(`enquiries:${query}`, () => get<Paged<EnquiryRow> & { byStatus: Record<string, number> }>(`/admin/enquiries${query}`));
  const { data: team } = useTeam();
  const total = Object.values(data?.byStatus ?? {}).reduce((a, n) => a + n, 0);

  const setStatus = async (e: EnquiryRow, status: string) => {
    try {
      await patch(`/admin/enquiries/${e.id}`, { status });
      invalidate('enquiries', 'dashboard');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <>
      <PageHead title="Enquiries & leads" sub={`${total} enquiries · ${data?.byStatus.NEW ?? 0} new`}>
        {can('enquiry.export') && <a className="btn" href={downloadUrl('/admin/enquiries/export.csv')}><Download size={16} /> Export CSV</a>}
      </PageHead>
      <Card>
        <Tabs
          value={s.status ?? ''}
          onChange={(v) => set({ status: v, page: 1 })}
          tabs={[{ value: '', label: 'All', count: total }, ...ENQUIRY_STATUSES.map((st) => ({ value: st, label: humanise(st), count: data?.byStatus[st] ?? 0 }))]}
        />
        <div className="card-head">
          <Input className="sm" style={{ maxWidth: 280 }} placeholder="Name, email, phone or message" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select className="sm" style={{ width: 'auto' }} value={s.assignedTo ?? ''} onChange={(e) => set({ assignedTo: e.target.value, page: 1 })} placeholder="Anyone" options={(team ?? []).map((t) => ({ value: t.id, label: t.name }))} />
        </div>
        {error && <div className="card-body"><ErrorBox error={error} /></div>}
        <div className="table-wrap" style={{ padding: '0 14px 14px' }}>
          <table className="table">
            <thead><tr><th>Received</th><th>Name</th><th>Residences</th><th>Intent</th><th>Source</th><th>Status</th><th>Assigned</th></tr></thead>
            <tbody>
              {!data && Array.from({ length: 6 }, (_, i) => <tr key={i}><td colSpan={7}><Skeleton h={22} /></td></tr>)}
              {(data?.data ?? []).map((e) => (
                <tr key={e.id} data-clickable="true" onClick={() => set({ open: e.id }, { replace: false })}>
                  <td className="muted small nowrap">{ago(e.createdAt)}</td>
                  <td>
                    <span className="cell-strong">{e.name}</span> {e.verificationSkipped && <AlertTriangle size={13} color="var(--orange)" aria-label="Unverified" />}
                    <div className="muted small">{e.email}</div>
                  </td>
                  <td>{e.units.map((u) => `${fmtCode(u.code)} (${money(u.priceMinor, u.currency, { compact: true })})`).join(', ') || <span className="faint">General</span>}</td>
                  <td>{humanise(e.intent)}</td>
                  <td className="muted">{e.source ?? '—'}</td>
                  <td onClick={(ev) => ev.stopPropagation()}>
                    {can('enquiry.edit') ? (
                      <select className={`status-select tone-${ENQUIRY_TONE[e.status]}`} value={e.status} onChange={(ev) => void setStatus(e, ev.target.value)} aria-label={`Status of enquiry from ${e.name}`}>
                        {ENQUIRY_STATUSES.map((st) => <option key={st} value={st}>{humanise(st)}</option>)}
                      </select>
                    ) : <Badge tone={ENQUIRY_TONE[e.status]}>{humanise(e.status)}</Badge>}
                  </td>
                  <td>{e.assignedToName ?? <span className="faint">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data?.data.length === 0 && <Empty title="No enquiries here" icon={<Inbox size={34} />} />}
        </div>
        <div className="table-foot">{data && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(p) => set({ page: p })} />}</div>
      </Card>
      {s.open && <EnquiryDrawer id={s.open} onClose={() => set({ open: null })} />}
    </>
  );
}
