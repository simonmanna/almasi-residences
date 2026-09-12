import { useEffect, useState, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

/**
 * A small history router: the admin has a few dozen screens and no nested
 * layouts beyond the shell, so a dependency would add more than it saves.
 */
const EVENT = 'admin:navigate';

function subscribe(cb: () => void) {
  window.addEventListener('popstate', cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener('popstate', cb);
    window.removeEventListener(EVENT, cb);
  };
}

const snapshot = () => window.location.pathname + window.location.search;

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (to === snapshot()) return;
  if (opts.replace) window.history.replaceState(null, '', to);
  else window.history.pushState(null, '', to);
  window.dispatchEvent(new Event(EVENT));
  if (!opts.replace) window.scrollTo({ top: 0 });
}

export function useLocation() {
  const href = useSyncExternalStore(subscribe, snapshot);
  const url = new URL(href, window.location.origin);
  return { path: url.pathname, search: url.searchParams };
}

/** `/residences/:id` against `/residences/abc` → `{ id: 'abc' }`. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/').filter(Boolean);
  const b = path.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.startsWith(':')) params[a[i]!.slice(1)] = decodeURIComponent(b[i]!);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
  return <a href={to} onClick={handle} {...rest} />;
}

/**
 * State kept in the URL, so a filtered list can be bookmarked, shared, and
 * survives the back button.
 */
export function useSearchState(defaults: Record<string, string> = {}) {
  const { search } = useLocation();
  const values: Record<string, string> = { ...defaults };
  search.forEach((v, k) => (values[k] = v));
  const set = (patch: Record<string, string | number | null | undefined>, opts: { replace?: boolean } = { replace: true }) => {
    const next = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined || v === '' || String(v) === defaults[k]) next.delete(k);
      else next.set(k, String(v));
    }
    const s = next.toString();
    navigate(`${window.location.pathname}${s ? `?${s}` : ''}`, opts);
  };
  return [values, set] as const;
}

/** Debounces a fast-changing value (search boxes). */
export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
