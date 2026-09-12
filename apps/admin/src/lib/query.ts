import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A minimal query cache: one in-flight request per key, results kept while a
 * screen is open, and `invalidate(prefix)` after a write refetches every open
 * view that read that data. Enough for an admin used by a handful of people;
 * no stale-while-revalidate cleverness that could show an old price.
 */
type Entry = { data?: unknown; error?: unknown; promise?: Promise<unknown>; at: number };
const cache = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();

function notify(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

export function invalidate(...prefixes: string[]) {
  for (const key of [...cache.keys()]) {
    if (prefixes.some((p) => key === p || key.startsWith(p))) {
      cache.delete(key);
      notify(key);
    }
  }
  for (const key of listeners.keys()) if (prefixes.some((p) => key.startsWith(p))) notify(key);
}

export interface Query<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  refetch: () => void;
}

export function useQuery<T>(key: string | null, fn: () => Promise<T>): Query<T> {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

  const load = useCallback(
    (k: string) => {
      const existing = cache.get(k);
      if (existing?.promise) return;
      const entry: Entry = { at: Date.now(), data: existing?.data };
      entry.promise = fnRef
        .current()
        .then((data) => {
          cache.set(k, { data, at: Date.now() });
        })
        .catch((error) => {
          cache.set(k, { error, data: existing?.data, at: Date.now() });
        })
        .finally(() => notify(k));
      cache.set(k, entry);
    },
    [],
  );

  useEffect(() => {
    if (!key) return;
    let set = listeners.get(key);
    if (!set) listeners.set(key, (set = new Set()));
    const onChange = () => {
      if (!cache.has(key)) load(key);
      rerender();
    };
    set.add(onChange);
    if (!cache.has(key)) load(key);
    else rerender();
    return () => {
      set!.delete(onChange);
    };
  }, [key, load, rerender]);

  const entry = key ? cache.get(key) : undefined;
  return {
    data: entry?.data as T | undefined,
    error: (entry?.error as Error | undefined) ?? null,
    loading: Boolean(key && (!entry || (entry.promise && entry.data === undefined))),
    refetch: () => key && invalidate(key),
  };
}

/** Wraps a write: tracks pending state and surfaces the API's message on failure. */
export function useMutation<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setPending(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (e) {
        setError((e as Error).message);
        throw e;
      } finally {
        setPending(false);
      }
    },
    [fn],
  );
  return { run, pending, error, setError };
}
