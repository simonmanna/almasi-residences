import { useMemo, useState } from 'react';
import { Building } from 'lucide-react';
import { STATUS_LABEL, UNIT_STATUSES, type UnitStatus } from '@avida/types';
import { get } from '../lib/api';
import { area, code as fmtCode, money, STATUS_TONE } from '../lib/format';
import { useQuery } from '../lib/query';
import { useSearchState } from '../lib/router';
import type { BuildingFloor, BuildingUnit } from '../lib/types';
import { BuildingMap } from '../components/BuildingMap';
import { InlinePrice } from '../components/InlinePrice';
import { StatusSelect } from '../components/StatusSelect';
import { UnitQuickView } from '../components/UnitQuickView';
import { Button, Card, CardHead, ErrorBox, LoadingPage, PageHead, Select } from '../components/ui';

/**
 * §49 / §50 — the availability map for the sales team: the whole building,
 * what is free, and who is interested in what. Filters dim rather than hide,
 * so the shape of the building stays readable.
 */
export default function Availability() {
  const [s, set] = useSearchState();
  const { data: floors, error, refetch } = useQuery('building', () => get<BuildingFloor[]>('/admin/building'));
  const [open, setOpen] = useState<string | null>(null);
  const statuses = (s.status ?? '').split(',').filter(Boolean) as UnitStatus[];

  const units = useMemo(() => (floors ?? []).flatMap((f) => f.units.map((u) => ({ ...u, floor: f }))), [floors]);
  const counts = useMemo(() => Object.fromEntries(UNIT_STATUSES.map((st) => [st, units.filter((u) => u.status === st).length])) as Record<UnitStatus, number>, [units]);
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!floors) return <LoadingPage />;

  const matches = (u: BuildingUnit) =>
    (!statuses.length || statuses.includes(u.status)) &&
    (!s.bedrooms || (s.bedrooms === 'ph' ? u.typology.isPenthouse : !u.typology.isPenthouse && String(u.bedrooms) === s.bedrooms)) &&
    (!s.interest || u.enquiryCount + u.interestCount > 0);
  const shown = units.filter(matches);

  const toggleStatus = (st: UnitStatus) => {
    const next = statuses.includes(st) ? statuses.filter((x) => x !== st) : [...statuses, st];
    set({ status: next.join(',') });
  };

  return (
    <>
      <PageHead title="Availability" sub={`${counts.AVAILABLE} of ${units.length} residences available now`}>
        <Select className="sm" style={{ width: 'auto' }} value={s.bedrooms ?? ''} onChange={(e) => set({ bedrooms: e.target.value })} placeholder="All sizes" options={[{ value: '1', label: '1 bedroom' }, { value: '2', label: '2 bedrooms' }, { value: '3', label: '3 bedrooms' }, { value: 'ph', label: 'Penthouses' }]} />
        <Button size="sm" onClick={() => set({ interest: s.interest ? '' : '1' })} style={s.interest ? { borderColor: 'var(--sky-400)', color: 'var(--sky-700)' } : undefined}>With interest</Button>
        {(statuses.length > 0 || s.bedrooms || s.interest) && <Button size="sm" variant="ghost" onClick={() => set({ status: '', bedrooms: '', interest: '' })}>Clear</Button>}
      </PageHead>

      <div className="grid-3" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 12 }}>
        {UNIT_STATUSES.map((st) => (
          <button key={st} type="button" className="card stat" style={{ padding: 16, outline: statuses.includes(st) ? '2px solid var(--sky-400)' : undefined }} onClick={() => toggleStatus(st)} aria-pressed={statuses.includes(st)}>
            <span className={`stat-icon tone-${STATUS_TONE[st]}`} style={{ width: 38, height: 38 }}><Building size={17} /></span>
            <div>
              <div className="stat-label">{STATUS_LABEL[st]}</div>
              <div className="stat-value tabular" style={{ fontSize: 22 }}>{counts[st]}</div>
            </div>
          </button>
        ))}
      </div>

      <Card>
        <CardHead title="The building" icon={<Building size={19} />} sub="Click a residence to see it, change its status or its price. A blue dot means someone is interested." />
        <div className="card-body">
          <BuildingMap floors={floors} onSelect={(u) => setOpen(u.id)} selectedId={open} dim={(u) => !matches(u)} />
        </div>
      </Card>

      <Card>
        <CardHead title="Sales sheet" sub={`${shown.length} residences`} />
        <div className="table-wrap" style={{ padding: '0 14px 14px' }}>
          <table className="table">
            <thead><tr><th>Unit</th><th>Floor</th><th>Type</th><th className="num">Beds</th><th className="num">Size</th><th className="num">Price</th><th>Status</th><th className="num">Enquiries</th><th className="num">Interested</th></tr></thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.id} data-clickable="true" onClick={() => setOpen(u.id)}>
                  <td className="cell-strong">{fmtCode(u.code)}</td>
                  <td className="muted">{u.floor.displayName ?? u.floor.label}</td>
                  <td>{u.typology.name}</td>
                  <td className="num">{u.bedrooms}</td>
                  <td className="num">{area(u.areaSqm)}</td>
                  <td className="num"><InlinePrice id={u.id} code={u.code} priceMinor={u.priceMinor} currency={u.currency} effectiveMinor={u.effectivePriceMinor} /></td>
                  <td><StatusSelect id={u.id} code={u.code} status={u.status} /></td>
                  <td className="num">{u.enquiryCount || '—'}</td>
                  <td className="num">{u.interestCount || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-foot">Value of the residences shown: {money(shown.reduce((a, u) => a + u.effectivePriceMinor, 0), 'USD', { compact: true })}</div>
      </Card>

      {open && <UnitQuickView id={open} onClose={() => setOpen(null)} />}
    </>
  );
}
