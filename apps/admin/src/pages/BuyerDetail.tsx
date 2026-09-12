import { useState } from 'react';
import { Archive, History, Inbox, Mail, Pencil, Phone, Plus, RotateCcw, X } from 'lucide-react';
import { BUYER_STAGES, humanise } from '@avida/types';
import { del, get, patch, post, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { code as fmtCode, date, dateTime, ENQUIRY_TONE, initials, money, STAGE_TONE } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { Link } from '../lib/router';
import type { ActivityRow, Paged } from '../lib/types';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, CardHead, ErrorBox, Field, KV, LoadingPage, Modal, PageHead, Select, StatusBadge, useConfirm } from '../components/ui';
import { BuyerForm, type BuyerRow } from './Buyers';

interface BuyerDetail extends Omit<BuyerRow, 'units' | 'interests' | 'enquiryCount'> {
  units: { id: string; code: string; status: string; priceMinor: number; currency: string; floor: { label: string } }[];
  interests: { id: string; code: string; status: string; priceMinor: number; currency: string }[];
  enquiries: { id: string; status: string; intent: string; message: string | null; createdAt: string; source: string | null }[];
  residents: { id: string; fullName: string; occupancyStatus: string }[];
  activity: ActivityRow[];
  createdAt: string;
}

function LinkUnit({ id, relation, onClose }: { id: string; relation: 'interest' | 'purchase'; onClose: () => void }) {
  const toast = useToast();
  const { data: units } = useQuery('residences:picker', () => get<Paged<{ id: string; code: string; status: string }>>(`/admin/residences${qs({ pageSize: 500, sort: 'code' })}`));
  const [unitId, setUnitId] = useState('');
  return (
    <Modal title={relation === 'interest' ? 'Record interest in a residence' : 'Record the purchase of a residence'} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!unitId} onClick={async () => {
      try {
        await post(`/admin/buyers/${id}/units`, { unitId, relation });
        toast.success('Saved.');
        invalidate('buyers', 'residence:');
        onClose();
      } catch (e) {
        toast.error((e as Error).message);
      }
    }}>Save</Button></>}>
      <Field label="Residence" hint={relation === 'purchase' ? 'Mark its status as sold or reserved separately.' : undefined}>
        <Select value={unitId} onChange={(e) => setUnitId(e.target.value)} placeholder="Choose" options={(units?.data ?? []).map((u) => ({ value: u.id, label: `${fmtCode(u.code)} — ${humanise(u.status)}` }))} />
      </Field>
    </Modal>
  );
}

/** §13 — one client: where they are in the lifecycle, what they bought, what they asked. */
export default function BuyerDetailPage({ params }: { params: Record<string, string> }) {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: b, error, refetch } = useQuery(`buyers:detail:${params.id}`, () => get<BuyerDetail>(`/admin/buyers/${params.id}`));
  const [edit, setEdit] = useState(false);
  const [link, setLink] = useState<'interest' | 'purchase' | null>(null);
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!b) return <LoadingPage />;
  const editable = can('buyer.edit');

  const unlink = async (unitId: string, relation: 'interest' | 'purchase') => {
    if (!(await confirm({ title: relation === 'purchase' ? 'Remove as buyer of this residence?' : 'Remove this interest?', confirm: 'Remove', danger: true }))) return;
    await del(`/admin/buyers/${b.id}/units/${unitId}?relation=${relation}`);
    invalidate('buyers', 'residence:');
  };
  const stage = async (s: string) => {
    try {
      await patch(`/admin/buyers/${b.id}`, { stage: s });
      invalidate('buyers');
      toast.success(`Stage: ${humanise(s)}.`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <PageHead title={<span className="row" style={{ gap: 14 }}><span className="avatar">{initials(b.fullName)}</span>{b.fullName}</span>} crumbs={[{ label: 'Buyers & clients', to: '/buyers' }, { label: b.fullName }]}>
        {editable ? (
          <select className={`status-select tone-${STAGE_TONE[b.stage]}`} value={b.stage} onChange={(e) => void stage(e.target.value)} aria-label="Stage">
            {BUYER_STAGES.map((st) => <option key={st} value={st}>{humanise(st)}</option>)}
          </select>
        ) : <Badge tone={STAGE_TONE[b.stage]}>{humanise(b.stage)}</Badge>}
        {editable && <Button icon={<Pencil size={15} />} onClick={() => setEdit(true)}>Edit</Button>}
        {editable && (b.archivedAt ? (
          <Button icon={<RotateCcw size={15} />} onClick={async () => { await post(`/admin/buyers/${b.id}/restore`); invalidate('buyers'); }}>Restore</Button>
        ) : (
          <Button variant="danger" icon={<Archive size={15} />} onClick={async () => { if (await confirm({ title: `Archive ${b.fullName}?`, confirm: 'Archive', danger: true })) { await post(`/admin/buyers/${b.id}/archive`); invalidate('buyers'); } }}>Archive</Button>
        ))}
      </PageHead>

      <div className="grid-3" style={{ alignItems: 'start' }}>
        <Card>
          <CardHead title="Contact" />
          <div className="card-body">
            <KV items={[
              [<span className="row" style={{ gap: 6 }}><Mail size={14} /> Email</span>, b.email ? <a href={`mailto:${b.email}`}>{b.email}</a> : '—'],
              [<span className="row" style={{ gap: 6 }}><Phone size={14} /> Phone</span>, b.phone ? <a href={`tel:${b.phone}`}>{b.phone}</a> : '—'],
              ['Country', b.countryIso ?? '—'],
              ['Source', b.source ?? '—'],
              ['Agent', b.assignedTo?.name ?? 'Unassigned'],
              ['Client since', date(b.createdAt)],
            ]} />
            {b.notes && <p style={{ marginBottom: 0, whiteSpace: 'pre-line' }}>{b.notes}</p>}
          </div>
        </Card>
        <Card>
          <CardHead title="Residences">{editable && <Button size="sm" icon={<Plus size={14} />} onClick={() => setLink('purchase')}>Purchase</Button>}</CardHead>
          <div className="card-body stack-sm">
            {b.units.length === 0 && <p className="muted small">No purchase recorded.</p>}
            {b.units.map((u) => (
              <div key={u.id} className="row">
                <Link to={`/residences/${u.id}`} className="cell-strong">{fmtCode(u.code)}</Link>
                <StatusBadge status={u.status} />
                <span className="muted small">{money(u.priceMinor, u.currency)}</span>
                <span className="spacer" />
                {editable && <Button size="xs" variant="ghost" icon={<X size={13} />} aria-label="Remove" onClick={() => void unlink(u.id, 'purchase')} />}
              </div>
            ))}
            <hr className="divider" style={{ margin: '8px 0' }} />
            <div className="row"><span className="label">Interested in</span><span className="spacer" />{editable && <Button size="xs" icon={<Plus size={13} />} onClick={() => setLink('interest')}>Add</Button>}</div>
            {b.interests.length === 0 && <p className="muted small">No interests recorded.</p>}
            {b.interests.map((u) => (
              <div key={u.id} className="row">
                <Link to={`/residences/${u.id}`}>{fmtCode(u.code)}</Link>
                <StatusBadge status={u.status} />
                <span className="spacer" />
                {editable && <Button size="xs" variant="ghost" icon={<X size={13} />} aria-label="Remove" onClick={() => void unlink(u.id, 'interest')} />}
              </div>
            ))}
            {b.residents.length > 0 && (
              <>
                <hr className="divider" style={{ margin: '8px 0' }} />
                <span className="label">Living there</span>
                {b.residents.map((r) => <Link key={r.id} to={`/residents/${r.id}`}>{r.fullName}</Link>)}
              </>
            )}
          </div>
        </Card>
        <Card>
          <CardHead title="Enquiries" icon={<Inbox size={17} />} />
          <div className="card-body stack-sm">
            {b.enquiries.length === 0 && <p className="muted small">No website enquiries linked.</p>}
            {b.enquiries.map((e) => (
              <Link key={e.id} to={`/enquiries?open=${e.id}`} style={{ color: 'inherit', padding: '8px 0', borderTop: '1px solid var(--line-2)' }}>
                <div className="row"><Badge tone={ENQUIRY_TONE[e.status]}>{humanise(e.status)}</Badge><span className="muted small">{date(e.createdAt)} · {humanise(e.intent)}</span></div>
                {e.message && <p className="small" style={{ margin: '6px 0 0' }}>{e.message}</p>}
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHead title="Activity" icon={<History size={17} />} />
        <div className="card-body">
          {b.activity.length === 0 && <p className="muted small">No changes yet.</p>}
          {b.activity.map((a) => (
            <div key={a.id} className="row" style={{ padding: '8px 0', borderTop: '1px solid var(--line-2)' }}>
              <span style={{ flex: 1 }}>{a.summary}</span>
              <span className="muted small">{a.actorName} · {dateTime(a.createdAt)}</span>
            </div>
          ))}
        </div>
      </Card>

      {edit && <BuyerForm buyer={b} onClose={() => { setEdit(false); refetch(); }} />}
      {link && <LinkUnit id={b.id} relation={link} onClose={() => { setLink(null); refetch(); }} />}
    </>
  );
}
