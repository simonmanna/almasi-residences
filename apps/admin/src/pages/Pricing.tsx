import { useState } from 'react';
import { History, Tag } from 'lucide-react';
import { get, post, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago, area, code as fmtCode, money } from '../lib/format';
import { invalidate, useQuery } from '../lib/query';
import { floorName } from '../lib/ref';
import { Link, useSearchState } from '../lib/router';
import type { ActivityRow, Paged, ResidenceDetail, ResidenceRow } from '../lib/types';
import { InlinePrice } from '../components/InlinePrice';
import { PricingFields, type ResidenceDraft } from '../components/ResidenceFields';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, CardHead, Drawer, ErrorBox, Field, Input, PageHead, Pagination, Select, Skeleton, StatusBadge } from '../components/ui';

/** Discount, promotion, fees and plan for one residence, in a side panel. */
function PricingDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const toast = useToast();
  const { data: u } = useQuery(`residence:${id}`, () => get<ResidenceDetail>(`/admin/residences/${id}`));
  const [d, setD] = useState<ResidenceDraft | null>(null);
  const [reason, setReason] = useState('');
  if (u && !d) {
    setD({
      ...({} as ResidenceDraft),
      priceMinor: u.priceMinor,
      currency: u.currency,
      discountMinor: u.discountMinor,
      promoPriceMinor: u.promoPriceMinor,
      promoEndsAt: u.promoEndsAt?.slice(0, 10) ?? '',
      reservationFeeMinor: u.reservationFeeMinor,
      depositPercent: u.depositPercent,
      paymentPlanId: u.paymentPlanId ?? '',
      areaSqm: u.areaSqm,
    } as ResidenceDraft);
  }
  const save = async () => {
    if (!d) return;
    try {
      await post(`/admin/residences/${id}/price`, {
        priceMinor: d.priceMinor ?? undefined,
        currency: d.currency,
        discountMinor: d.discountMinor,
        promoPriceMinor: d.promoPriceMinor,
        promoEndsAt: d.promoPriceMinor ? d.promoEndsAt || null : null,
        reservationFeeMinor: d.reservationFeeMinor,
        depositPercent: d.depositPercent,
        paymentPlanId: d.paymentPlanId || null,
        reason: reason || undefined,
      });
      toast.success('Pricing saved. The website updates straight away.');
      invalidate('residences', `residence:${id}`, 'dashboard', 'building', 'pricing');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Drawer title={u ? `Pricing — ${fmtCode(u.code)}` : 'Pricing'} sub={u && `${u.typology.name} · ${area(u.areaSqm)}`} onClose={onClose} footer={<Button variant="primary" onClick={() => void save()}>Save pricing</Button>}>
      {!d ? <Skeleton h={240} /> : (
        <>
          <PricingFields d={d} set={(k, v) => setD({ ...d, [k]: v })} />
          <Field label="Reason for the change" hint="Recorded in the price history."><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          {u && u.priceHistory.length > 0 && (
            <div className="stack-sm">
              <div className="label">Price history</div>
              {u.priceHistory.map((p) => (
                <div key={p.id} className="small">{money(p.fromMinor, p.currency)} → <strong>{money(p.toMinor, p.currency)}</strong> <span className="muted">· {p.actorName}, {ago(p.createdAt)}{p.reason ? ` · ${p.reason}` : ''}</span></div>
              ))}
            </div>
          )}
        </>
      )}
    </Drawer>
  );
}

/** §10 — every price in one place. Nothing here is typed into the website; it reads these. */
export default function Pricing() {
  const { can } = useAuth();
  const [s, set] = useSearchState({ sort: 'floor', page: '1' });
  const [open, setOpen] = useState<string | null>(null);
  const query = qs({ sort: s.sort, dir: s.dir, status: s.status, page: s.page, pageSize: 50 });
  const { data, error } = useQuery(`residences:pricing:${query}`, () => get<Paged<ResidenceRow>>(`/admin/residences${query}`));
  const { data: changes } = useQuery(can('audit.view') ? 'pricing:changes' : null, () => get<Paged<ActivityRow & { actor: { name: string } }>>('/admin/audit?action=residence.price&pageSize=12'));
  const rows = data?.data ?? [];

  return (
    <>
      <PageHead title="Pricing" sub="List price, discounts, promotions and price per m² for every residence.">
        <Select className="sm" style={{ width: 'auto' }} value={s.status ?? ''} onChange={(e) => set({ status: e.target.value, page: 1 })} placeholder="All statuses" options={[{ value: 'AVAILABLE', label: 'Available only' }, { value: 'RESERVED,BOOKED', label: 'Reserved / booked' }, { value: 'SOLD', label: 'Sold only' }]} />
        <Select className="sm" style={{ width: 'auto' }} value={`${s.sort}:${s.dir ?? 'asc'}`} onChange={(e) => { const [sort, dir] = e.target.value.split(':'); set({ sort, dir, page: 1 }); }} options={[{ value: 'floor:asc', label: 'By floor' }, { value: 'price:desc', label: 'Highest price first' }, { value: 'price:asc', label: 'Lowest price first' }, { value: 'size:desc', label: 'Largest first' }]} />
        <Link to="/residences" className="btn">Bulk price change</Link>
      </PageHead>
      <div className="detail-grid">
        <Card>
          <CardHead title="Residence prices" icon={<Tag size={18} />} />
          {error && <div className="card-body"><ErrorBox error={error} /></div>}
          <div className="table-wrap" style={{ padding: '0 14px 14px' }}>
            <table className="table">
              <thead><tr><th>Unit</th><th>Floor</th><th className="num">Size</th><th className="num">List price</th><th className="num">Discount</th><th className="num">Promotion</th><th className="num">Price now</th><th className="num">Per m²</th><th>Status</th><th /></tr></thead>
              <tbody>
                {!data && Array.from({ length: 8 }, (_, i) => <tr key={i}><td colSpan={10}><Skeleton h={20} /></td></tr>)}
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="cell-strong">{fmtCode(r.code)}</td>
                    <td className="muted">{floorName(r.floor)}</td>
                    <td className="num">{area(r.areaSqm)}</td>
                    <td className="num"><InlinePrice id={r.id} code={r.code} priceMinor={r.priceMinor} currency={r.currency} /></td>
                    <td className="num">{r.discountMinor ? money(r.discountMinor, r.currency) : '—'}</td>
                    <td className="num">{r.promoPriceMinor ? <Badge tone="orange" plain>{money(r.promoPriceMinor, r.currency)}</Badge> : '—'}</td>
                    <td className="num cell-strong">{money(r.effectivePriceMinor, r.currency)}</td>
                    <td className="num muted">{r.pricePerSqmMinor ? money(r.pricePerSqmMinor, r.currency) : '—'}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="actions">{can('residence.price') && <Button size="xs" onClick={() => setOpen(r.id)}>Edit</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-foot">
            {rows.length > 0 && `Average ${money(Math.round(rows.reduce((a, r) => a + r.effectivePriceMinor, 0) / rows.length), rows[0]!.currency)} · average per m² ${money(Math.round(rows.reduce((a, r) => a + r.effectivePriceMinor, 0) / rows.reduce((a, r) => a + r.areaSqm, 0)), rows[0]!.currency)}`}
            {data && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(p) => set({ page: p })} />}
          </div>
        </Card>
        <Card>
          <CardHead title="Recent price changes" icon={<History size={17} />} />
          <div className="card-body activity">
            {!can('audit.view') && <p className="muted small">Each residence's price history is on its Pricing tab.</p>}
            {changes?.data.length === 0 && <p className="muted small">No price changes yet.</p>}
            {(changes?.data ?? []).map((a) => (
              <div key={a.id} className="activity-item" style={{ gridTemplateColumns: '1fr' }}>
                <div>
                  <strong>{a.summary}</strong>
                  <p>{a.actor.name}</p>
                  <time>{ago(a.createdAt)}</time>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      {open && <PricingDrawer id={open} onClose={() => setOpen(null)} />}
    </>
  );
}
