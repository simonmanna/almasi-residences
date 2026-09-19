/**
 * The visitor theme contract, shared by the server layout (boot scripts) and
 * the client switcher. Kept out of any 'use client' module: a string exported
 * from one reaches a server component as a client reference, not as the string.
 */
export const THEME_KEY = 'almasi:theme';

export const THEME_IDS = ['blue', 'wooden', 'sky'] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const DEFAULT_THEME: ThemeId = 'wooden';

/** Runs before first paint so a returning visitor never sees the default flash. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='blue'||t==='sky'||t==='wooden'){document.documentElement.dataset.theme=t}}catch(e){}`;

/** Before first paint: content marked data-reveal may start hidden only when motion is welcome. */
export const MOTION_SCRIPT = `try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches){document.documentElement.dataset.motion=''}}catch(e){}`;
