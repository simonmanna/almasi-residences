import { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money } from '../lib/format';
import { invalidate } from '../lib/query';
import { useToast } from './Toast';
import { useConfirm } from './ui';

/**
 * §25 — click a price to change it. Enter saves, Escape cancels; a change of
 * more than 20% asks first, because a slipped digit is the likeliest mistake.
 */
export function InlinePrice({ id, code, priceMinor, currency, effectiveMinor }: { id: string; code: string; priceMinor: number; currency: string; effectiveMinor?: number }) {
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(priceMinor / 100));
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const shown = (
    <span className="tabular">
      {money(effectiveMinor ?? priceMinor, currency)}
      {effectiveMinor !== undefined && effectiveMinor !== priceMinor && <s className="faint small" style={{ marginLeft: 6 }}>{money(priceMinor, currency)}</s>}
    </span>
  );
  if (!can('residence.price')) return shown;

  const save = async () => {
    const next = Math.round(Number(text.replace(/[^\d.]/g, '')) * 100);
    if (!Number.isFinite(next) || next <= 0) {
      toast.error('Enter a price above zero.');
      return;
    }
    if (next === priceMinor) return setEditing(false);
    const change = Math.abs(next - priceMinor) / priceMinor;
    if (change > 0.2) {
      const ok = await confirm({
        title: `Change ${code.replace(/-/g, ' ')} to ${money(next, currency)}?`,
        body: `That is ${Math.round(change * 100)}% ${next > priceMinor ? 'more' : 'less'} than ${money(priceMinor, currency)}. The website updates straight away.`,
        confirm: 'Change price',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await post(`/admin/residences/${id}/price`, { priceMinor: next });
      toast.success(`${code.replace(/-/g, ' ')} price ${money(priceMinor, currency)} → ${money(next, currency)}`);
      invalidate('residences', 'residence:', 'dashboard', 'building', 'pricing');
      setEditing(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <span className="inline-edit" onClick={(e) => e.stopPropagation()}>
        <input
          ref={input}
          value={text}
          disabled={busy}
          inputMode="decimal"
          aria-label={`New price for ${code}`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
            if (e.key === 'Escape') {
              setText(String(priceMinor / 100));
              setEditing(false);
            }
          }}
          onBlur={() => !busy && setEditing(false)}
        />
      </span>
    );
  }
  return (
    <button
      type="button"
      className="inline-edit"
      style={{ background: 'none', border: '1px dashed transparent', font: 'inherit', color: 'inherit' }}
      title="Click to change the price"
      onClick={(e) => {
        e.stopPropagation();
        setText(String(priceMinor / 100));
        setEditing(true);
      }}
    >
      {shown}
      <Pencil size={12} className="faint" />
    </button>
  );
}
