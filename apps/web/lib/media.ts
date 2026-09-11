import type { MediaAssetDto, MediaSetDto } from './api';
import { toTimeStateKey, type TimeState } from '@avida/types';

const MEDIA_URL = process.env.NEXT_PUBLIC_MEDIA_URL ?? '';

export function mediaSrc(key: string): string {
  // Phase 0/1 placeholders are served from the app's own /public (DECISIONS
  // D-07); processed assets come from R2 behind the CDN.
  if (!MEDIA_URL || key.startsWith('seed-media/')) return `/${key}`;
  return `${MEDIA_URL.replace(/\/$/, '')}/${key}`;
}

/**
 * §6.2 — resolve a set to the asset for the current time state, falling back to
 * DAY and then to whatever exists. A missing state must never render a broken
 * image; it logs and degrades.
 */
export function resolveAsset(set: MediaSetDto, state: TimeState): MediaAssetDto | null {
  const exact = set.assets[toTimeStateKey(state)];
  if (exact) return exact;

  const day = set.assets.DAY;
  if (day) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[media] set "${set.key}" has no ${state} asset; falling back to day`);
    }
    return day;
  }
  return Object.values(set.assets).find(Boolean) ?? null;
}

export interface VariantMap {
  avif?: Record<string, string>;
  webp?: Record<string, string>;
}

/** The pipeline writes `{ avif: { 400: key, ... }, webp: { ... } }` (§5.8). */
export function hasVariants(asset: MediaAssetDto): boolean {
  const v = (asset as MediaAssetDto & { variants?: VariantMap }).variants;
  return Boolean(v?.avif && Object.keys(v.avif).length > 0);
}

export function srcSetFor(asset: MediaAssetDto, format: 'avif' | 'webp'): string | null {
  const v = (asset as MediaAssetDto & { variants?: VariantMap }).variants?.[format];
  if (!v) return null;
  const entries = Object.entries(v).sort((a, b) => Number(a[0]) - Number(b[0]));
  if (entries.length === 0) return null;
  return entries.map(([width, key]) => `${mediaSrc(key)} ${width}w`).join(', ');
}

/**
 * §6.2 — a thumbhash renders a blurred stand-in from ~25 bytes, so the layout
 * is never empty and never shifts (§6.6 CLS budget). Decoding happens on the
 * client; this only builds the data URL input.
 */
export function thumbhashBytes(asset: MediaAssetDto): Uint8Array | null {
  const hash = (asset as MediaAssetDto & { thumbhash?: string }).thumbhash;
  if (!hash) return null;
  try {
    const binary = atob(hash);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}
