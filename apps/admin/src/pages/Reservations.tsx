import { CalendarCheck, Handshake } from 'lucide-react';
import { humanise } from '@avida/types';
import { get } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ago, area, code as fmtCode, money, STAGE_TONE } from '../lib/format';
import { useQuery } from '../lib/query';
import { floorName, useCurrency } from '../lib/ref';
import { Link, navigate } from '../lib/router';
import type { Paged, ResidenceRow } from '../lib/types';
import { StatusSelect } from '../components/StatusSelect';
import { Badge, Card, CardHead, Empty, ErrorBox, LoadingPage, PageHead, Stat } from '../components/ui';
import type { BuyerRow } from './Buyers';

/** §10 — residences held for someone, and the clients at the reservation stage. */
export default function Reservations() {
  const currency = useCurrency();
  const { can } = useAuth();
  const { data, error } = useQuery('residences:held', () => get<Paged<ResidenceRow>>('/admin/residences?status=RESERVED,ON_HOLD&pageSize=200&sort=updated'));
  const { data: buyers } = useQuery(can('buyer.view') ? 'buyers:reservation' : null, () => get<Paged<BuyerRow>>('/admin/buyers?stage=RESERVATION&pageSize=100'));
  if (error) return <ErrorBox error={error} />;
  if (!data) return <LoadingPage />;
  const rows = data.data;
  const reserved = rows.filter((r) => r.status === 'RESERVED');
  const held = rows.filter((r) => r.status === 'ON_HOLD');
  const value = rows.reduce((a, r) => a + r.effectivePriceMinor, 0);

  return (
    <>
      <PageHead title="Reservations" sub="Residences reserved or on hold. Change a status here and the website follows." />
      <div className="grid-3">
        <Stat label="Reserved" value={reserved.length} icon={<CalendarCheck size={20} />} tone="blue" />
        <Stat label="On hold" value={held.length} icon={<CalendarCheck size={20} />} tone="orange" />
        <Stat label="Value held" value={money(value, currency, { compact: true })} icon={<CalendarCheck size={20} />} tone="indigo" />
      </div>
      <Card>
        <CardHead title="Held residences" icon={<CalendarCheck size={18} />} />
        {rows.length === 0 ? <Empty title="Nothing reserved or on hold" /> : (
          <div className="table-wrap" style={{ padding: '0 14px 14px' }}>
            <table className="table">
              <thead><tr><th>Unit</th><th>Floor</th><th>Type</th><th className="num">Size</th><th className="num">Price</th><th>Status</th>{can('buyer.view') && <th>Buyer</th>}<th className="num">Interest</th><th>Last change</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} data-clickable="true" onClick={() => navigate(`/residences/${r.id}?tab=people`)}>
                    <td className="cell-strong">{fmtCode(r.code)}</td>
                    <td className="muted">{floorName(r.floor)}</td>
                    <td>{r.typology.name}</td>
                    <td className="num">{area(r.areaSqm)}</td>
                    <td className="num">{money(r.effectivePriceMinor, r.currency)}</td>
                    <td><StatusSelect id={r.id} code={r.code} status={r.status} /></td>
                    {can('buyer.view') && <td>{r.buyer ? <Link to={`/buyers/${r.buyer.id}`} onClick={(e) => e.stopPropagation()}>{r.buyer.fullName}</Link> : <span className="faint">Not recorded</span>}</td>}
                    <td className="num">{r.enquiryCount + r.interestCount || '—'}</td>
                    <td className="muted small">{ago(r.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {can('buyer.view') && (
        <Card>
          <CardHead title="Clients at reservation stage" icon={<Handshake size={18} />} />
          {(buyers?.data ?? []).length === 0 ? <Empty title="No clients at the reservation stage" /> : (
            <div className="table-wrap" style={{ padding: '0 14px 14px' }}>
              <table className="table">
                <thead><tr><th>Client</th><th>Stage</th><th>Residences</th><th>Interested in</th><th>Agent</th></tr></thead>
                <tbody>
                  {(buyers?.data ?? []).map((b) => (
                    <tr key={b.id} data-clickable="true" onClick={() => navigate(`/buyers/${b.id}`)}>
                      <td className="cell-strong">{b.fullName}</td>
                      <td><Badge tone={STAGE_TONE[b.stage]}>{humanise(b.stage)}</Badge></td>
                      <td>{b.units.map((u) => fmtCode(u.code)).join(', ') || '—'}</td>
                      <td className="muted">{b.interests.map((u) => fmtCode(u.code)).join(', ') || '—'}</td>
                      <td>{b.assignedTo?.name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
