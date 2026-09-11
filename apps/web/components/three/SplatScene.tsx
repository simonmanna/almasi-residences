'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useCapabilities } from '../../lib/capability/useCapabilities';

/**
 * §8.7 F17 — Gaussian splat scenes.
 *
 * Three constraints from the spec, all enforced here rather than trusted to a
 * caller: never on first paint, always behind an explicit action, and a hard
 * 25MB budget for the initial view (§6.6).
 *
 * §8.7 also says these only exist once something physical does — captured on
 * site, trained in Postshot, exported as .spz. Until then this renders the
 * gate and the honest reason it is empty.
 */
const SPLAT_BUDGET_MB = 25;

const SparkViewer = dynamic(() => import('./SparkViewer').then((m) => m.SparkViewer), {
  ssr: false,
  loading: () => <p className="note">Loading the scene…</p>,
});

export function SplatScene({
  url,
  sizeMb,
  label,
}: {
  url: string | null;
  sizeMb: number | null;
  label: string;
}) {
  const [entered, setEntered] = useState(false);
  const caps = useCapabilities();

  if (!url) {
    return (
      <p className="note">
        TODO(content) — no captured scene yet. Splat scenes are captured on site once construction
        is far enough along (§8.7).
      </p>
    );
  }

  // §8.1 — falls back to the tour, which is the next-heaviest thing that works.
  if (caps.probed && !caps.heavy3d) {
    return (
      <p className="note">
        The immersive scene needs a faster connection and a more capable device than this one. The
        360° tour covers the same rooms.
      </p>
    );
  }

  if (sizeMb !== null && sizeMb > SPLAT_BUDGET_MB) {
    // A budget that is only checked in review is not a budget.
    return (
      <p className="note">
        This scene is {Math.round(sizeMb)}MB, over the {SPLAT_BUDGET_MB}MB limit for an initial
        view. It needs re-exporting at a lower level of detail before it can be shown.
      </p>
    );
  }

  if (!entered) {
    return (
      <div className="splat-gate">
        <h3 className="head">{label}</h3>
        <p className="prose">
          A photographic 3D capture of the finished space. It downloads roughly{' '}
          <span data-numeric>{sizeMb ?? SPLAT_BUDGET_MB}MB</span>, so it only loads when you ask
          for it.
        </p>
        <button type="button" className="button" onClick={() => setEntered(true)}>
          Enter immersive view
        </button>
      </div>
    );
  }

  return <SparkViewer url={url} label={label} onExit={() => setEntered(false)} />;
}
