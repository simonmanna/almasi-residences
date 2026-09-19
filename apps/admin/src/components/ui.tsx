import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, X } from 'lucide-react';
import { STATUS_TONE, statusLabel } from '../lib/format';
import { mediaSrcSet, mediaUrl } from '../lib/api';
import { Link } from '../lib/router';

// ─── Buttons ─────────────────────────────────────────────────────────────

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'danger' | 'ghost' | 'default';
  size?: 'sm' | 'xs';
  icon?: ReactNode;
  busy?: boolean;
};

export function Button({ variant = 'default', size, icon, busy, children, className = '', disabled, ...rest }: BtnProps) {
  const cls = ['btn', variant !== 'default' ? variant : '', size ?? '', !children ? 'icon' : '', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} disabled={disabled || busy} {...rest}>
      {busy ? <span className="spinner" style={{ width: 14, height: 14 }} /> : icon}
      {children}
    </button>
  );
}

// ─── Badges ──────────────────────────────────────────────────────────────

export function Badge({ tone = 'grey', children, plain }: { tone?: string; children: ReactNode; plain?: boolean }) {
  return <span className={`badge tone-${tone} ${plain ? 'plain' : ''}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status as keyof typeof STATUS_TONE] ?? 'grey'}>{statusLabel(status)}</Badge>;
}

// ─── Layout ──────────────────────────────────────────────────────────────

export function Card({ children, className = '', pad }: { children: ReactNode; className?: string; pad?: boolean }) {
  return <section className={`card ${pad ? 'card-pad' : ''} ${className}`}>{children}</section>;
}

export function CardHead({ title, icon, children, sub }: { title: ReactNode; icon?: ReactNode; children?: ReactNode; sub?: ReactNode }) {
  return (
    <header className="card-head">
      <div>
        <h2>
          {icon}
          {title}
        </h2>
        {sub && <p className="muted small" style={{ margin: '4px 0 0' }}>{sub}</p>}
      </div>
      {children && (
        <>
          <span className="spacer" />
          {children}
        </>
      )}
    </header>
  );
}

export function PageHead({ title, sub, crumbs, children }: { title: ReactNode; sub?: ReactNode; crumbs?: { label: string; to?: string }[]; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {crumbs && (
          <nav className="breadcrumb" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={i} className="row" style={{ gap: 6 }}>
                {c.to ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}
                {i < crumbs.length - 1 && <ChevronRight size={13} />}
              </span>
            ))}
          </nav>
        )}
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && (
        <>
          <span className="spacer" />
          <div className="row-wrap">{children}</div>
        </>
      )}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  icon,
  tone = 'sky',
  onClick,
  to,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  icon: ReactNode;
  tone?: string;
  onClick?: () => void;
  to?: string;
}) {
  const body = (
    <>
      <span className={`stat-icon tone-${tone}`}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div className="stat-label">{label}</div>
        <div className="stat-value tabular">{value}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
      {(onClick || to) && <ChevronRight size={16} className="stat-chevron" />}
    </>
  );
  if (to) return <Link to={to} className="card stat" style={{ color: 'inherit' }}>{body}</Link>;
  if (onClick) return <button type="button" className="card stat" onClick={onClick}>{body}</button>;
  return <div className="card stat">{body}</div>;
}

export function Empty({ title, children, icon, action }: { title: string; children?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon ?? <Inbox size={34} />}
      <strong>{title}</strong>
      {children && <div className="small" style={{ maxWidth: 380 }}>{children}</div>}
      {action}
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-label="Loading" />;
}

export function LoadingPage() {
  return (
    <div className="loading-page">
      <Spinner />
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w }} />;
}

export function ErrorBox({ error, onRetry }: { error: Error | string; onRetry?: () => void }) {
  return (
    <div className="alert error">
      <AlertTriangle size={18} />
      <div style={{ flex: 1 }}>{typeof error === 'string' ? error : error.message}</div>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Alert({ tone = 'info', children, icon }: { tone?: 'info' | 'warn' | 'error' | 'success'; children: ReactNode; icon?: ReactNode }) {
  return (
    <div className={`alert ${tone}`}>
      {icon}
      <div>{children}</div>
    </div>
  );
}

export function KV({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="kv">
      {items.map(([k, v], i) => (
        <div key={i} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

// ─── Form controls ───────────────────────────────────────────────────────

export function Field({ label, hint, error, children, className = '' }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={`field ${className}`}>
      <span>{label}</span>
      {children}
      {error ? <span className="error-text">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

export const Input = ({ className = '', ...p }: ComponentProps<'input'>) => <input className={`input ${className}`} {...p} />;
export const Textarea = ({ className = '', ...p }: ComponentProps<'textarea'>) => <textarea className={`textarea ${className}`} {...p} />;
export function Select({ className = '', options, placeholder, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <select className={`select ${className}`} {...p}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className="toggle" style={disabled ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
      {label}
    </label>
  );
}

export function Checkbox({ checked, onChange, label, indeterminate, ...rest }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; indeterminate?: boolean; 'aria-label'?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);
  return (
    <label className="checkbox" onClick={(e) => e.stopPropagation()}>
      <input ref={ref} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={rest['aria-label']} />
      {label}
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Money in major units while typing; minor units in and out. */
export function MoneyInput({ value, onChange, currency = 'USD', ...rest }: { value: number | null | undefined; onChange: (minor: number | null) => void; currency?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [text, setText] = useState(value === null || value === undefined ? '' : String(value / 100));
  useEffect(() => {
    setText(value === null || value === undefined ? '' : String(value / 100));
  }, [value]);
  return (
    <div className="input-affix">
      <span className="affix">{currency === 'USD' ? '$' : currency}</span>
      <input
        className="input tabular"
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.]/g, '');
          setText(t);
          onChange(t === '' ? null : Math.round(Number(t) * 100));
        }}
        style={{ paddingLeft: currency === 'USD' ? 26 : 46 }}
        {...rest}
      />
    </div>
  );
}

/**
 * A number field in two modes. Pass `value` + `onChange` for a controlled field
 * whose value lives in a draft; pass `defaultValue` (and read the input on
 * `onBlur`) for an inline cell that saves itself. Passing `value` without an
 * `onChange` that can act on it freezes the field — hence the explicit split.
 */
export function NumberInput({ value, defaultValue, onChange, suffix, step = 'any', ...rest }: { value?: number | null; defaultValue?: number | null; onChange?: (v: number | null) => void; suffix?: string; step?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'defaultValue'>) {
  const controlled = onChange !== undefined;
  return (
    <div className={suffix ? 'input-affix suffix' : undefined}>
      <input
        className="input tabular"
        type="number"
        step={step}
        {...(controlled
          ? { value: value ?? '', onChange: (e: ChangeEvent<HTMLInputElement>) => onChange!(e.target.value === '' ? null : Number(e.target.value)) }
          : { defaultValue: defaultValue ?? value ?? '' })}
        {...rest}
      />
      {suffix && <span className="affix">{suffix}</span>}
    </div>
  );
}

// ─── Tabs & pagination ───────────────────────────────────────────────────

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode; count?: number; hidden?: boolean }[] }) {
  return (
    <div className="tabs" role="tablist">
      {tabs
        .filter((t) => !t.hidden)
        .map((t) => (
          <button key={t.value} role="tab" type="button" aria-selected={t.value === value} onClick={() => onChange(t.value)}>
            {t.label}
            {t.count !== undefined && <span className="count">{t.count}</span>}
          </button>
        ))}
    </div>
  );
}

export function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null;
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1);
  return (
    <nav className="pagination" aria-label="Pages">
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
        <ChevronLeft size={15} />
      </button>
      {nums.map((n, i) => (
        <span key={n} style={{ display: 'contents' }}>
          {i > 0 && n - nums[i - 1]! > 1 && <span className="faint" style={{ padding: '0 4px' }}>…</span>}
          <button type="button" aria-current={n === page ? 'page' : undefined} onClick={() => onChange(n)}>
            {n}
          </button>
        </span>
      ))}
      <button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page">
        <ChevronRight size={15} />
      </button>
    </nav>
  );
}

// ─── Overlays ────────────────────────────────────────────────────────────

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

export function Modal({ title, sub, onClose, children, footer, size }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'lg' | 'xl' }) {
  useEscape(onClose);
  const id = useId();
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size ?? ''}`} role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <h2 id={id}>{title}</h2>
            {sub && <p>{sub}</p>}
          </div>
          <Button variant="ghost" size="sm" icon={<X size={18} />} aria-label="Close" onClick={onClose} />
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ title, sub, onClose, children, footer }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEscape(onClose);
  const id = useId();
  return (
    <div className="overlay drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="drawer-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id={id}>{title}</h2>
            {sub && <div className="muted small" style={{ marginTop: 4 }}>{sub}</div>}
          </div>
          <Button variant="ghost" size="sm" icon={<X size={18} />} aria-label="Close" onClick={onClose} />
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </div>
  );
}

/** A dropdown anchored to its trigger; closes on outside click and Escape. */
export function Menu({ trigger, children, align = 'right' }: { trigger: (open: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }} onClick={(e) => e.stopPropagation()}>
      {trigger(() => setOpen((o) => !o))}
      {open && (
        <div className="menu" style={{ [align]: 0, top: 'calc(100% + 6px)' }} role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

// ─── Confirmation ────────────────────────────────────────────────────────

interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirm?: string;
  danger?: boolean;
  /** Ask the person to type this to confirm — for permanent deletions. */
  typeToConfirm?: string;
}

const ConfirmCtx = createContext<(o: ConfirmOptions) => Promise<boolean>>(() => Promise.resolve(false));

/** §42 — every destructive action goes through this dialog. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [typed, setTyped] = useState('');
  const ask = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => { setTyped(''); setState({ ...o, resolve }); }), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      {state && (
        <Modal
          title={state.title}
          onClose={() => close(false)}
          footer={
            <>
              <Button onClick={() => close(false)}>Cancel</Button>
              <Button
                variant={state.danger ? 'danger' : 'primary'}
                className={state.danger ? 'solid' : ''}
                disabled={Boolean(state.typeToConfirm) && typed !== state.typeToConfirm}
                onClick={() => close(true)}
                autoFocus
              >
                {state.confirm ?? 'Confirm'}
              </Button>
            </>
          }
        >
          {state.body && <div style={{ color: 'var(--ink-2)' }}>{state.body}</div>}
          {state.typeToConfirm && (
            <Field label={<>Type <strong>{state.typeToConfirm}</strong> to confirm</>}>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
            </Field>
          )}
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);

// ─── Media ───────────────────────────────────────────────────────────────

export interface MediaLike {
  url: string;
  thumbUrl?: string;
  srcSet?: string | null;
  blurDataUrl?: string | null;
  altText?: string | null;
  title?: string | null;
  kind?: string;
  mimeType?: string;
}

/** §33 — responsive, lazy, with the blur placeholder painted underneath. */
export function MediaImg({ m, sizes = '300px', className, thumb, style }: { m: MediaLike | null | undefined; sizes?: string; className?: string; thumb?: boolean; style?: React.CSSProperties }) {
  if (!m) return null;
  if (m.kind === 'VIDEO') {
    return <video className={className} src={mediaUrl(m.url)} muted playsInline preload="metadata" style={style} />;
  }
  return (
    <img
      className={className}
      src={mediaUrl(thumb ? (m.thumbUrl ?? m.url) : m.url)}
      srcSet={mediaSrcSet(m.srcSet)}
      sizes={sizes}
      alt={m.altText ?? m.title ?? ''}
      loading="lazy"
      decoding="async"
      style={{ backgroundImage: m.blurDataUrl ? `url(${m.blurDataUrl})` : undefined, backgroundSize: 'cover', ...style }}
    />
  );
}
