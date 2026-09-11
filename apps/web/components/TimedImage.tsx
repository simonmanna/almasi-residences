'use client';

import { useEffect, useRef, useState } from 'react';
import type { MediaSetDto } from '../lib/api';
import { hasVariants, mediaSrc, resolveAsset, srcSetFor } from '../lib/media';
import { useTimeState } from '../lib/time-state/TimeStateProvider';

/** §2.3 — images crossfade over 1200ms. */
const CROSSFADE_MS = 1200;

/**
 * §6.2 — two stacked layers: the outgoing image sits underneath at full
 * opacity while the incoming one fades in over it, then the outgoing layer is
 * dropped.
 *
 * The fade is a CSS animation on the incoming image rather than a JS-driven
 * opacity toggle. A toggle needs a paint between "mounted opaque" and "animate
 * to zero", which means requestAnimationFrame — and rAF does not run in a
 * background tab, so the outgoing layer would sit opaque over the new image
 * until its timer fired (DECISIONS D-14).
 *
 * Phase 2: when the pipeline has produced variants, this renders the full
 * AVIF/WebP ladder; the seed placeholders still render as a plain <img>.
 */
export function TimedImage({
  set,
  priority = false,
  sizes = '100vw',
  className,
}: {
  set: MediaSetDto;
  priority?: boolean;
  sizes?: string;
  className?: string;
}) {
  const { state, reducedMotion } = useTimeState();
  const asset = resolveAsset(set, state);
  const [outgoing, setOutgoing] = useState<string | null>(null);
  const previous = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const src = asset ? mediaSrc(asset.originalKey) : null;

  useEffect(() => {
    if (!src) return;
    if (previous.current && previous.current !== src && !reducedMotion) {
      setOutgoing(previous.current);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setOutgoing(null), CROSSFADE_MS);
    }
    previous.current = src;
  }, [src, reducedMotion]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (!asset || !src) {
    // §6.7 — never a broken image. An empty, correctly-sized box is better.
    return <div className={className} data-media-missing={set.key} aria-hidden="true" />;
  }

  const avif = srcSetFor(asset, 'avif');
  const webp = srcSetFor(asset, 'webp');
  const alt = asset.altText ?? set.label;

  return (
    <div
      className={className}
      data-media-set={set.key}
      // §6.6 — the dominant colour holds the space before any pixel arrives, so
      // the layout never shifts.
      style={asset.dominantHex ? { backgroundColor: asset.dominantHex } : undefined}
    >
      {outgoing && (
        <img src={outgoing} alt="" aria-hidden="true" className="timed-image timed-image-under" />
      )}
      {hasVariants(asset) ? (
        <picture key={src}>
          {avif && <source type="image/avif" srcSet={avif} sizes={sizes} />}
          {webp && <source type="image/webp" srcSet={webp} sizes={sizes} />}
          <img
            src={src}
            alt={alt}
            width={asset.width || undefined}
            height={asset.height || undefined}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            className="timed-image timed-image-over"
            data-crossfade={outgoing ? 'in' : undefined}
          />
        </picture>
      ) : (
        <img
          key={src}
          src={src}
          alt={alt}
          width={asset.width || undefined}
          height={asset.height || undefined}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          className="timed-image timed-image-over"
          data-crossfade={outgoing ? 'in' : undefined}
        />
      )}
    </div>
  );
}
