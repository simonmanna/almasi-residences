/** §6.1 — the dual UI mode's shared vocabulary and resolution order. */

export const UI_MODES = ['single', 'multi'] as const;
export type UiMode = (typeof UI_MODES)[number];

export const UI_MODE_COOKIE = 'ui_mode';
export const UI_MODE_PARAM = 'ui';

export function isUiMode(v: unknown): v is UiMode {
  return v === 'single' || v === 'multi';
}

/**
 * §6.1 — query param, then cookie, then env default. Used by middleware so the
 * rewrite target is decided in exactly one place.
 */
export function resolveUiMode(input: {
  param?: string | null;
  cookie?: string | null;
  envDefault?: string | null;
}): UiMode {
  if (isUiMode(input.param)) return input.param;
  if (isUiMode(input.cookie)) return input.cookie;
  if (isUiMode(input.envDefault)) return input.envDefault;
  return 'multi'; // §6.1 — multi-page is the SEO default.
}
