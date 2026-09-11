'use client';

import { useEffect, useState } from 'react';
import { SECTIONS, SINGLE_PAGE_ORDER } from './sections/registry';

/**
 * §6.1 — the difference single-page mode is allowed: a sticky rail showing
 * where you are in the document. §2.6 forbids scroll-driven animation, so this
 * only marks the current section; it does not move anything.
 */
export function SectionRail() {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const targets = SINGLE_PAGE_ORDER.map((id) => document.getElementById(SECTIONS[id].id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: '-15% 0px -75% 0px', threshold: [0, 0.3, 0.6] },
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="rail" aria-label="Sections">
      <ol>
        {SINGLE_PAGE_ORDER.map((id) => (
          <li key={id}>
            <a
              href={`#${SECTIONS[id].id}`}
              aria-current={active === SECTIONS[id].id ? 'true' : undefined}
            >
              {SECTIONS[id].label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
