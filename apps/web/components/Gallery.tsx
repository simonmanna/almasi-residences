'use client';

import { useMemo, useState } from 'react';
import { TIME_STATES, TIME_STATE_LABEL, toTimeStateKey, type TimeState } from '@avida/types';
import type { MediaSetDto } from '../lib/api';
import { mediaSrc } from '../lib/media';
import { CgiDisclaimer } from './CgiDisclaimer';
import { useTimeState } from '../lib/time-state/TimeStateProvider';

/**
 * §9 Phase 2 task 9 — the gallery, filterable by time state and by set kind.
 *
 * The time filter defaults to whatever the site is currently showing, so
 * arriving here at dusk shows the building at dusk. Choosing "every time"
 * lays the four states of one view side by side, which is the clearest
 * demonstration of the whole idea.
 */
export function Gallery({ sets }: { sets: MediaSetDto[] }) {
  const { state } = useTimeState();
  const [kind, setKind] = useState<string>('ALL');
  const [timeFilter, setTimeFilter] = useState<TimeState | 'ALL'>(state);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);

  const kinds = useMemo(() => ['ALL', ...new Set(sets.map((s) => s.kind))], [sets]);

  const items = useMemo(() => {
    const chosen = sets.filter((s) => kind === 'ALL' || s.kind === kind);
    return chosen.flatMap((set) => {
      const states = timeFilter === 'ALL' ? TIME_STATES : [timeFilter];
      return states.flatMap((t) => {
        const asset = set.assets[toTimeStateKey(t)];
        return asset
          ? [{
              id: `${set.id}-${t}`,
              src: mediaSrc(asset.originalKey),
              alt: asset.altText ?? `${set.label}, ${t}`,
              label: set.label,
              timeState: t,
              dominantHex: asset.dominantHex,
            }]
          : [];
      });
    });
  }, [sets, kind, timeFilter]);

  return (
    <section id="gallery" className="section">
      <div className="gallery-filters">
        <fieldset className="filter-group">
          <legend>Subject</legend>
          {kinds.map((k) => (
            <button
              key={k}
              type="button"
              className="button-quiet"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
            >
              {k === 'ALL' ? 'Everything' : k.toLowerCase()}
            </button>
          ))}
        </fieldset>

        <fieldset className="filter-group">
          <legend>Time of day</legend>
          <button
            type="button"
            className="button-quiet"
            aria-pressed={timeFilter === 'ALL'}
            onClick={() => setTimeFilter('ALL')}
          >
            Every time
          </button>
          {TIME_STATES.map((t) => (
            <button
              key={t}
              type="button"
              className="button-quiet"
              aria-pressed={timeFilter === t}
              onClick={() => setTimeFilter(t)}
            >
              {TIME_STATE_LABEL[t]}
            </button>
          ))}
        </fieldset>
      </div>

      <ul className="gallery-grid">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="gallery-item"
              onClick={() => setLightbox({ src: item.src, alt: item.alt })}
              style={item.dominantHex ? { backgroundColor: item.dominantHex } : undefined}
            >
              <img src={item.src} alt={item.alt} loading="lazy" decoding="async" />
              <span className="gallery-caption">
                {item.label}
                <span className="muted"> {TIME_STATE_LABEL[item.timeState].toLowerCase()}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <CgiDisclaimer className="disclaimer" />

      {lightbox && (
        // A dialog rather than a bare overlay: Escape closes it and focus is
        // contained, which a div with an onClick would not give us (§6.5).
        <dialog
          className="lightbox"
          open
          onClick={() => setLightbox(null)}
          onKeyDown={(e) => e.key === 'Escape' && setLightbox(null)}
          aria-label={lightbox.alt}
        >
          <img src={lightbox.src} alt={lightbox.alt} />
          <button type="button" className="button-quiet" onClick={() => setLightbox(null)}>
            Close
          </button>
        </dialog>
      )}
    </section>
  );
}
