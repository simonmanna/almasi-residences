'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { UI_MODE_COOKIE, type UiMode } from '@avida/types';
import { track } from '../lib/analytics';
import { hrefFor, NAV_SECTIONS, SECTIONS } from './sections/registry';

/**
 * §6.1 — one navigation component, two behaviours. Same markup; the href and
 * the active-state logic differ by mode. Single-page mode scrolls to an anchor
 * and tracks position with an IntersectionObserver; multi-page mode links and
 * compares pathnames.
 */
export function Nav({ mode, developmentName }: { mode: UiMode; developmentName: string }) {
  const pathname = usePathname();
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'single') return;
    const targets = NAV_SECTIONS.map((id) => document.getElementById(SECTIONS[id].id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActiveId(visible.target.id);
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: [0, 0.25, 0.5] },
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [mode]);

  function switchMode(next: UiMode) {
    // The cookie is the persistent choice (§6.1); the param makes it shareable.
    document.cookie = `${UI_MODE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
    track('ui_mode_switched', { to: next });
    window.location.href = next === 'single' ? '/?ui=single' : '/?ui=multi';
  }

  return (
    <nav className="nav" aria-label="Primary">
      <Link href="/" className="nav-brand">
        {developmentName}
      </Link>

      <ul className="nav-links">
        {NAV_SECTIONS.map((id) => {
          const href = hrefFor(id, mode);
          const active =
            mode === 'single' ? activeId === SECTIONS[id].id : pathname === SECTIONS[id].route;
          return (
            <li key={id}>
              <Link href={href} aria-current={active ? 'page' : undefined} className="nav-link">
                {SECTIONS[id].label}
              </Link>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className="button-quiet nav-mode"
        onClick={() => switchMode(mode === 'single' ? 'multi' : 'single')}
      >
        {mode === 'single' ? 'Browse as pages' : 'Read as one page'}
      </button>
    </nav>
  );
}
