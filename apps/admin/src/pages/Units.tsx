import { useCallback, useEffect, useState } from 'react';
import { allowedTransitions, STATUS_LABEL, UNIT_STATUSES, type UnitStatus } from '@avida/types';
import { api, type AdminUnit } from '../api';

/**
 * §5.4 — the daily action: select units, flip their status. The transition
 * rules are enforced by the API (§5.5); the UI only avoids offering a move it
 * knows will be refused, so a mistake is a disabled option rather than an error.
 */
export function Units() {
  const [units, setUnits] = useState<AdminUnit[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void api.units(filter ? { status: filter } : {}).then((r) => setUnits(r.data));
  }, [filter]);

  useEffect(load, [load]);

  const selectedUnits = units.filter((u) => selected.has(u.id));
  // Only offer statuses every selected unit can legally reach.
  const offered = UNIT_STATUSES.filter(
    (target) =>
      selectedUnits.length > 0 &&
      selectedUnits.every(
        (u) => u.status === target || allowedTransitions(u.status as UnitStatus).includes(target),
      ),
  );

  async function apply(status: UnitStatus) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const r = await api.bulkStatus([...selected], status);
      setMessage(
        `${r.changed} unit${r.changed === 1 ? '' : 's'} set to ${STATUS_LABEL[status].toLowerCase()}` +
          (r.unchanged ? `, ${r.unchanged} already were` : ''),
      );
      setSelected(new Set());
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <main>
      <h2>Units</h2>

      <div className="toolbar">
        <label>
          Status
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All</option>
            {UNIT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>

        <span className="selected-count">{selected.size} selected</span>

        {offered.map((s) => (
          <button key={s} type="button" disabled={busy} onClick={() => void apply(s)}>
            Set {STATUS_LABEL[s].toLowerCase()}
          </button>
        ))}
      </div>

      {message && <p className="ok">{message}</p>}
      {error && <p className="error">{error}</p>}

      <table>
        <thead>
          <tr>
            <th />
            <th>Unit</th>
            <th>Floor</th>
            <th>Typology</th>
            <th className="num">Area</th>
            <th className="num">Price</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {units.map((u) => (
            <tr key={u.id} data-selected={selected.has(u.id) || undefined}>
              <td>
                <input
                  type="checkbox"
                  checked={selected.has(u.id)}
                  onChange={() => toggle(u.id)}
                  aria-label={`Select unit ${u.code}`}
                />
              </td>
              <td>{u.code}</td>
              <td className="num">{u.floor.label}</td>
              <td>{u.typology.name}</td>
              <td className="num">{u.areaSqm.toFixed(1)} m²</td>
              <td className="num">
                {new Intl.NumberFormat('en-GB', {
                  style: 'currency',
                  currency: u.currency,
                  currencyDisplay: 'narrowSymbol',
                  maximumFractionDigits: 0,
                }).format(u.priceMinor / 100)}
              </td>
              <td>{STATUS_LABEL[u.status]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
