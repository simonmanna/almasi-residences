'use client';

import dynamic from 'next/dynamic';
import type { MediaSetDto } from '../lib/api';
import { mediaSrc, resolveAsset } from '../lib/media';
import { useCapabilities } from '../lib/capability/useCapabilities';
import { useTimeState } from '../lib/time-state/TimeStateProvider';
import { TimedImage } from './TimedImage';

/** §6.6 — everything WebGL is dynamic and never blocks first paint. */
const DepthParallax = dynamic(
  () => import('./three/DepthParallax').then((m) => m.DepthParallax),
  { ssr: false },
);

/**
 * §8.1 — the parallax degrades to a static image, independently of every other
 * 3D feature. Three things must all hold before the shader runs: the device can
 * take it, the asset has a depth map, and the visitor has not asked for reduced
 * motion.
 */
export function ParallaxHero({ set, className }: { set: MediaSetDto; className?: string }) {
  const { state } = useTimeState();
  const caps = useCapabilities();
  const asset = resolveAsset(set, state);
  const depthKey = asset ? (asset as { depthKey?: string | null }).depthKey : null;

  if (!caps.probed || !caps.heavy3d || !asset || !depthKey) {
    return <TimedImage set={set} priority className={className} />;
  }

  return (
    <DepthParallax
      className={className}
      imageSrc={mediaSrc(asset.originalKey)}
      depthSrc={mediaSrc(depthKey)}
      alt={asset.altText ?? set.label}
    />
  );
}
