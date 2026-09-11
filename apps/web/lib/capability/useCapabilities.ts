'use client';

import { useEffect, useState } from 'react';

/**
 * §8.1 — probe once at mount and share the result. Every 3D feature degrades
 * independently from this: heavy WebGL runs only on webgl2 with at least 4GB,
 * no save-data, and a 4g connection.
 */
export interface Capabilities {
  webgl2: boolean;
  memory: number;
  saveData: boolean;
  effectiveType: string;
  reducedMotion: boolean;
  /** The single gate for anything expensive. */
  heavy3d: boolean;
  /** False until the probe has run, so SSR and the first paint agree. */
  probed: boolean;
}

const INITIAL: Capabilities = {
  webgl2: false,
  memory: 4,
  saveData: false,
  effectiveType: '4g',
  reducedMotion: false,
  heavy3d: false,
  probed: false,
};

interface NavigatorWithHints extends Navigator {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
}

export function probeCapabilities(): Capabilities {
  const nav = navigator as NavigatorWithHints;

  let webgl2 = false;
  try {
    const canvas = document.createElement('canvas');
    webgl2 = Boolean(canvas.getContext('webgl2'));
  } catch {
    webgl2 = false;
  }

  const memory = nav.deviceMemory ?? 4;
  const saveData = nav.connection?.saveData ?? false;
  const effectiveType = nav.connection?.effectiveType ?? '4g';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return {
    webgl2,
    memory,
    saveData,
    effectiveType,
    reducedMotion,
    heavy3d: webgl2 && memory >= 4 && !saveData && effectiveType === '4g' && !reducedMotion,
    probed: true,
  };
}

export function useCapabilities(): Capabilities {
  const [caps, setCaps] = useState<Capabilities>(INITIAL);
  useEffect(() => setCaps(probeCapabilities()), []);
  return caps;
}
