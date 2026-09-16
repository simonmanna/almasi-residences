'use client';

import { useEffect, useState } from 'react';
import { useLenis } from '../layout/SmoothScroll';
import styles from './SectionIndex.module.css';

interface Chapter {
  id: string;
  label: string;
}

/**
 * A fourteen-section page needs a way to see where you are and to skip ahead.
 *
 * The chapter names are not written here: each section already opens with a
 * kicker — "The building", "Selected", "Enquire" — so the index reads them
 * from the rendered page. A section with no kicker is not a chapter and is
 * skipped, which keeps this honest when the page is re-ordered in the CMS.
 */
export function SectionIndex() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const lenis = useLenis();

  useEffect(() => {
    const main = document.getElementById('main');
    if (!main) return;

    const found: Chapter[] = [];
    main.querySelectorAll(':scope > section').forEach((section, i) => {
      const label = section.querySelector('.mark')?.textContent?.trim();
      if (!label) return;
      if (!section.id) section.id = `chapter-${i}`;
      found.push({ id: section.id, label });
    });
    if (found.length < 4) return;
    setChapters(found);

    // The chapter whose top has most recently passed the upper third wins.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: '-33% 0px -60% 0px' },
    );
    for (const c of found) {
      const el = document.getElementById(c.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, []);

  if (chapters.length === 0) return null;

  const go = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { offset: -80 });
    else el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav className={styles.index} aria-label="Sections of this page">
      <ol>
        {chapters.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className={styles.link}
              data-active={active === c.id ? 'true' : 'false'}
              aria-current={active === c.id ? 'true' : undefined}
              onClick={() => go(c.id)}
            >
              <span className={styles.tick} aria-hidden="true" />
              <span className={styles.label}>{c.label}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
