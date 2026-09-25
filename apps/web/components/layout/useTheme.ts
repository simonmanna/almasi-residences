'use client';

import { useSyncExternalStore } from 'react';
import { DEFAULT_THEME, isThemeId, type ThemeId } from '../../lib/theme';

/**
 * The live theme, for the few components that must know it (the nav's ground,
 * the 3D building). The admin sets it; the layout writes it onto <html>.
 */
export function useTheme(): ThemeId {
  return useSyncExternalStore(
    (onChange) => {
      const mo = new MutationObserver(onChange);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      return () => mo.disconnect();
    },
    () => {
      const t = document.documentElement.dataset.theme;
      return isThemeId(t) ? t : DEFAULT_THEME;
    },
    () => DEFAULT_THEME,
  );
}
