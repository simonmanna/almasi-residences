import type { ReactNode } from 'react';

export interface Slice {
  label: string;
  value: number;
  color: string;
}

/** A ring chart. Values are drawn as proportions; the centre shows `centre`. */
export function Donut({ slices, size = 150, thickness = 20, centre }: { slices: Slice[]; size?: number; thickness?: number; centre?: ReactNode }) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={slices.map((s) => `${s.label} ${s.value}`).join(', ')}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-2)" strokeWidth={thickness} />
        {total > 0 &&
          slices.map((s) => {
            const len = (s.value / total) * c;
            const el = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${Math.max(0, len - 2)} ${c}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                strokeLinecap="butt"
              />
            );
            offset += len;
            return el;
          })}
      </svg>
      {centre && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{centre}</div>}
    </div>
  );
}

/** One stacked bar per row — e.g. value by status per residence type. */
export function StackBars({ rows, format }: { rows: { label: string; parts: Slice[] }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.parts.reduce((a, p) => a + p.value, 0)));
  return (
    <div className="bars">
      {rows.map((row) => {
        const sum = row.parts.reduce((a, p) => a + p.value, 0);
        return (
          <div key={row.label} className="bar-row">
            <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
            <div className="bar-track" style={{ width: `${(sum / max) * 100}%`, minWidth: 4 }}>
              {row.parts.map((p) => (
                <span key={p.label} title={`${p.label}: ${format ? format(p.value) : p.value}`} style={{ width: `${sum ? (p.value / sum) * 100 : 0}%`, background: p.color }} />
              ))}
            </div>
            <span className="tabular" style={{ textAlign: 'right', fontWeight: 600 }}>{format ? format(sum) : sum}</span>
          </div>
        );
      })}
    </div>
  );
}
