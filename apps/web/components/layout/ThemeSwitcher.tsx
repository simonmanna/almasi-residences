'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { DEFAULT_THEME, THEME_KEY, type ThemeId } from '../../lib/theme';
import styles from './ThemeSwitcher.module.css';

/**
 * The three looks, each drawn from its reference in theme-reference/. The
 * preview is a crop of that reference; the swatch is its ground, its accent
 * and its deepest tone.
 */
export const THEMES = [
  { id: 'blue', label: 'Blue', note: 'Architectural night', preview: '/themes/blue.webp', ground: '#11202E', accent: '#8ECDF4', night: '#0A1520' },
  { id: 'wooden', label: 'Wooden', note: 'Mahogany and brass', preview: '/themes/wooden.webp', ground: '#F2E6D6', accent: '#DBA858', night: '#3C1A07' },
  { id: 'sky', label: 'Sky Blue', note: 'Bright contemporary daylight', preview: '/themes/sky.webp', ground: '#F4F9FE', accent: '#1D6DB0', night: '#173656' },
] as const;

const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);

/** The live theme, for the few components that must know it (the nav's ground). */
export function useTheme(): ThemeId {
  return useSyncExternalStore(
    (onChange) => {
      const mo = new MutationObserver(onChange);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      return () => mo.disconnect();
    },
    () => {
      const t = document.documentElement.dataset.theme;
      return isTheme(t) ? t : DEFAULT_THEME;
    },
    () => DEFAULT_THEME,
  );
}

function apply(id: ThemeId) {
  document.documentElement.dataset.theme = id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEMES.find((t) => t.id === id)!.night);
}

function Swatch({ theme, className }: { theme: (typeof THEMES)[number]; className?: string }) {
  return (
    <span
      className={`${styles.swatch} ${className ?? ''}`}
      aria-hidden="true"
      style={{ '--sw-ground': theme.ground, '--sw-accent': theme.accent, '--sw-night': theme.night } as React.CSSProperties}
    />
  );
}

export function ThemeSwitcher() {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    rootRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (id: ThemeId) => {
    setOpen(false);
    buttonRef.current?.focus();
    try {
      localStorage.setItem(THEME_KEY, id);
    } catch {}
    if (id === theme) return;
    const root = document.documentElement;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) apply(id);
    else if ('startViewTransition' in document) document.startViewTransition(() => apply(id));
    else {
      // No view transitions: let every colour glide to the new theme instead.
      root.dataset.themeShift = '';
      apply(id);
      window.setTimeout(() => delete root.dataset.themeShift, 700);
    }
  };

  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  };

  const current = THEMES.find((t) => t.id === theme)!;

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Look: ${current.label}. Explore the look`}
        onClick={() => setOpen((o) => !o)}
      >
        <Swatch theme={current} />
        <span className={styles.triggerLabel}>{current.label}</span>
      </button>
      {open && (
        <div className={styles.menu} role="menu" aria-label="Explore the look" onKeyDown={onMenuKey} data-lenis-prevent>
          <p className={styles.eyebrow}>Explore the look</p>
          {THEMES.map((t, i) => (
            <button
              key={t.id}
              type="button"
              role="menuitemradio"
              aria-checked={t.id === theme}
              tabIndex={t.id === theme ? 0 : -1}
              className={styles.option}
              style={{ '--i': i } as React.CSSProperties}
              onClick={() => choose(t.id)}
            >
              <span className={styles.preview} aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element -- a 12 KB crop, not worth the optimiser */}
                <img src={t.preview} alt="" width={96} height={62} loading="lazy" decoding="async" />
              </span>
              <span className={styles.text}>
                <span className={styles.label}>
                  <Swatch theme={t} className={styles.swatchSm} />
                  {t.label}
                </span>
                <span className={styles.note}>{t.note}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
