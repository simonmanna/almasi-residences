'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { livePath, type InventoryDto, type LiveInventoryDto } from '../../lib/api';
import {
  applyLive,
  floorsOf,
  summarise,
  toResidences,
  type FloorSummary,
  type Residence,
  type ResidenceSummary,
} from '../../lib/residences';

/** §5.3 — the status delta is polled, never pushed; once a minute is plenty for a sales site. */
const POLL_MS = 60_000;

interface InventoryValue {
  /** False when the API could not be reached at render time (development only). */
  ready: boolean;
  residences: Residence[];
  summary: ResidenceSummary;
  floors: FloorSummary[];
  updatedAt: string | null;
}

const InventoryContext = createContext<InventoryValue | null>(null);

/**
 * The single source of truth on the client. Seeded with the server's inventory,
 * refreshed from the API's live endpoint, and read by every component that shows
 * a status or a count — so the building, the explorer and a residence page can
 * never disagree.
 */
export function InventoryProvider({
  initial,
  bathrooms,
  slug,
  children,
}: {
  initial: InventoryDto | null;
  bathrooms: Record<string, number>;
  slug: string;
  children: ReactNode;
}) {
  const [inventory, setInventory] = useState(initial);
  const [updatedAt, setUpdatedAt] = useState(initial?.generatedAt ?? null);

  useEffect(() => {
    if (!initial) return;
    let stopped = false;

    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetch(livePath(slug), { cache: 'no-store' });
        if (!res.ok || stopped) return;
        const live = (await res.json()) as LiveInventoryDto;
        setInventory((prev) => (prev ? applyLive(prev, live.units) : prev));
        setUpdatedAt(live.generatedAt);
      } catch {
        // §6.7 — a failed poll keeps the last good state; it is never an error to the visitor.
      }
    };

    const timer = window.setInterval(poll, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [initial, slug]);

  const value = useMemo<InventoryValue>(() => {
    const residences = inventory ? toResidences(inventory, bathrooms) : [];
    return {
      ready: inventory !== null,
      residences,
      summary: summarise(residences),
      floors: inventory ? floorsOf(inventory, residences) : [],
      updatedAt,
    };
  }, [inventory, bathrooms, updatedAt]);

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory(): InventoryValue {
  const value = useContext(InventoryContext);
  if (!value) throw new Error('useInventory must be used inside <InventoryProvider>');
  return value;
}

export function useResidence(slug: string): Residence | undefined {
  const { residences } = useInventory();
  return residences.find((r) => r.slug === slug);
}
