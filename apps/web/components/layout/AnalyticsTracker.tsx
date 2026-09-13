'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { track } from '../../lib/analytics';

/**
 * Page views for the funnel (roadmap item 40), including the two views the
 * reports care most about: the homepage and a residence's own page. Also picks
 * up the site's plain tel:/mailto:/WhatsApp links wherever they are, so a tap
 * on any of them is counted without every component remembering to.
 */
export function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    track('page_view');
    if (pathname === '/') track('development_viewed');
    const m = /^\/residences\/([^/]+)$/.exec(pathname);
    if (m?.[1]) track('residence_viewed', { residence: decodeURIComponent(m[1]).toUpperCase() });
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest('a');
      if (!a) return;
      const href = a.getAttribute('href') ?? '';
      const residence = /^\/residences\/([^/]+)/.exec(window.location.pathname)?.[1]?.toUpperCase();
      const source = a.closest('[data-analytics-source]')?.getAttribute('data-analytics-source') ?? undefined;
      if (href.startsWith('tel:')) track('phone_clicked', { residence, source });
      else if (href.startsWith('mailto:')) track('email_clicked', { residence, source });
      else if (/wa\.me|whatsapp/i.test(href) && !a.dataset.tracked) track('whatsapp_clicked', { residence, source });
      else if (href.includes('/brochure.pdf')) track('brochure_downloaded', { residence });
    };
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);

  return null;
}
