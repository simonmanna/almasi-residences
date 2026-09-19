import { useState } from 'react';
import { Megaphone, Plus } from 'lucide-react';
import { LEAD_SOURCE_LABEL, LEAD_SOURCES, type LeadSourceValue } from '@avida/types';
import { get, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { refreshCrm } from '../lib/crm';
import { date, money } from '../lib/format';
import { useQuery } from '../lib/query';
import { Link } from '../lib/router';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, Checkbox, Empty, ErrorBox, Field, Input, Modal, MoneyInput, PageHead, Select, Skeleton, Textarea } from '../components/ui';

interface Campaign {
  id: string;
  name: string;
  channel: string;
  utmCampaign: string | null;
  startsAt: string | null;
  endsAt: string | null;
  budgetMinor: number | null;
  active: boolean;
  notes: string | null;
  leads: number;
  won: number;
  open: number;
  costPerLeadMinor: number | null;
}

/** Marketing campaigns: what they cost, what they brought in, and what that sold. */
export default function Campaigns() {
  const { can } = useAuth();
  const { data, error, refetch } = useQuery('crm:campaigns', () => get<Campaign[]>('/admin/crm/campaigns'));
  const [editing, setEditing] = useState<Campaign | 'new' | null>(null);
  return (
    <>
      <PageHead title="Campaigns" sub="Website leads whose utm_campaign matches a campaign are linked to it automatically.">
        {can('campaign.edit') && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing('new')}>New campaign</Button>}
      </PageHead>
      <Card>
        {error && <ErrorBox error={error} onRetry={refetch} />}
        {!data && !error && <div className="card-body"><Skeleton h={160} /></div>}
        {data && data.length === 0 && <Empty title="No campaigns yet" icon={<Megaphone size={30} />}>Add one to see which marketing actually produces buyers.</Empty>}
        {data && data.length > 0 && (
          <div className="table-wrap">
            <table className="table crm-cards">
              <thead><tr><th>Campaign</th><th>Channel</th><th>Dates</th><th className="num">Budget</th><th className="num">Leads</th><th className="num">Open</th><th className="num">Sold</th><th className="num">Cost / lead</th><th /></tr></thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Campaign"><strong>{c.name}</strong>{!c.active && <> <Badge tone="grey" plain>ended</Badge></>}<div className="small muted">{c.utmCampaign ? `utm_campaign=${c.utmCampaign}` : 'No UTM tag'}</div></td>
                    <td data-label="Channel">{LEAD_SOURCE_LABEL[c.channel as LeadSourceValue]}</td>
                    <td data-label="Dates" className="small">{c.startsAt ? date(c.startsAt) : '—'} – {c.endsAt ? date(c.endsAt) : 'ongoing'}</td>
                    <td data-label="Budget" className="num">{c.budgetMinor ? money(c.budgetMinor, 'USD') : '—'}</td>
                    <td data-label="Leads" className="num"><Link to={`/enquiries?campaignId=${c.id}`}>{c.leads}</Link></td>
                    <td data-label="Open" className="num">{c.open}</td>
                    <td data-label="Sold" className="num"><strong>{c.won}</strong></td>
                    <td data-label="Cost / lead" className="num">{c.costPerLeadMinor ? money(c.costPerLeadMinor, 'USD') : '—'}</td>
                    <td className="actions">{can('campaign.edit') && <Button size="xs" onClick={() => setEditing(c)}>Edit</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && <CampaignModal campaign={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function CampaignModal({ campaign, onClose }: { campaign: Campaign | null; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState({ name: campaign?.name ?? '', channel: campaign?.channel ?? 'FACEBOOK', utmCampaign: campaign?.utmCampaign ?? '', startsAt: campaign?.startsAt?.slice(0, 10) ?? '', endsAt: campaign?.endsAt?.slice(0, 10) ?? '', budgetMinor: campaign?.budgetMinor ?? null, active: campaign?.active ?? true, notes: campaign?.notes ?? '' });
  const save = async () => {
    const body = { ...d, utmCampaign: d.utmCampaign || null, startsAt: d.startsAt ? new Date(`${d.startsAt}T00:00:00`).toISOString() : null, endsAt: d.endsAt ? new Date(`${d.endsAt}T23:59:00`).toISOString() : null, notes: d.notes || null };
    try {
      if (campaign) await patch(`/admin/crm/campaigns/${campaign.id}`, body);
      else await post('/admin/crm/campaigns', body);
      toast.success('Campaign saved.');
      refreshCrm();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Modal title={campaign ? 'Edit campaign' : 'New campaign'} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!d.name.trim()} onClick={() => void save()}>Save</Button></>}>
      <div className="grid-2">
        <Field label="Name"><Input autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
        <Field label="Channel"><Select value={d.channel} onChange={(e) => setD({ ...d, channel: e.target.value })} options={LEAD_SOURCES.map((s) => ({ value: s, label: LEAD_SOURCE_LABEL[s] }))} /></Field>
        <Field label="utm_campaign" hint="Links website leads automatically."><Input value={d.utmCampaign} placeholder="kigali-launch" onChange={(e) => setD({ ...d, utmCampaign: e.target.value })} /></Field>
        <Field label="Budget"><MoneyInput value={d.budgetMinor} onChange={(v) => setD({ ...d, budgetMinor: v })} /></Field>
        <Field label="Starts"><Input type="date" value={d.startsAt} onChange={(e) => setD({ ...d, startsAt: e.target.value })} /></Field>
        <Field label="Ends"><Input type="date" value={d.endsAt} onChange={(e) => setD({ ...d, endsAt: e.target.value })} /></Field>
      </div>
      <Field label="Notes"><Textarea rows={2} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></Field>
      <Checkbox checked={d.active} onChange={(v) => setD({ ...d, active: v })} label="Active — link new leads to it" />
    </Modal>
  );
}
