import { headers } from 'next/headers';
import { resolveUiMode, type UiMode } from '@avida/types';

/**
 * §6.1 — the mode was resolved once in proxy.ts and passed down as a header.
 * Pages read it here rather than re-deriving it, so there is exactly one
 * resolution order in the codebase.
 */
export async function currentUiMode(): Promise<UiMode> {
  const h = await headers();
  return resolveUiMode({
    param: h.get('x-ui-mode'),
    envDefault: process.env.NEXT_PUBLIC_UI_MODE_DEFAULT ?? null,
  });
}
