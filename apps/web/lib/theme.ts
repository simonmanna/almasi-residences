/**
 * The site theme contract. The admin chooses the look (Website → Theme); the
 * server layout writes it onto <html data-theme>, so every visitor sees the same
 * look from the first paint. Visitors do not choose. Kept out of any 'use client'
 * module: a string exported from one reaches a server component as a client
 * reference, not as the string.
 */
export const THEME_IDS = ['blue', 'wooden', 'sky'] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const DEFAULT_THEME: ThemeId = 'wooden';

export const isThemeId = (v: unknown): v is ThemeId => THEME_IDS.includes(v as ThemeId);

/** The browser chrome colour (meta theme-color) for each look: its deepest tone. */
export const THEME_NIGHT: Record<ThemeId, string> = { blue: '#0A1520', wooden: '#3A281B', sky: '#173656' };

/** Before first paint: content marked data-reveal may start hidden only when motion is welcome. */
export const MOTION_SCRIPT = `try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches){document.documentElement.dataset.motion=''}}catch(e){}`;
