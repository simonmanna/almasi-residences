'use client';

import { useEffect, useState } from 'react';
import { telHref, whatsappHref } from '../../lib/contact';
import { useContact } from '../providers/ContactProvider';
import { useEnquiry } from '../enquiry/EnquiryProvider';
import styles from './StickyMobileCta.module.css';

/**
 * Mobile only, from the first frame: enquiry, a call and WhatsApp sit a thumb
 * away as the phone's own tab bar. It steps aside wherever a page already offers the same actions
 * (elements marked `data-hide-sticky-cta`, such as the enquiry section and footer).
 */
export function StickyMobileCta({ showEnquire }: { showEnquire: boolean }) {
  const { open } = useEnquiry();
  const [suppressed, setSuppressed] = useState(false);

  useEffect(() => {
    const visible = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target);
        else visible.delete(e.target);
      }
      setSuppressed(visible.size > 0);
    });
    const watch = () => document.querySelectorAll('[data-hide-sticky-cta]').forEach((el) => io.observe(el));
    watch();
    // Pages mount after the shell; pick up their markers too.
    const mo = new MutationObserver(watch);
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);

  const contact = useContact();
  const wa = whatsappHref(contact);
  // Audit §16.4 — in this market a call is the highest-intent channel; keep it one tap away.
  const tel = telHref(contact);
  const shown = !suppressed;

  return (
    <div className={styles.bar} data-shown={shown ? 'true' : 'false'} data-ground="night" aria-hidden={!shown} data-analytics-source="sticky-cta">
      {showEnquire && (
        <button
          type="button"
          className={styles.tab}
          data-primary
          tabIndex={shown ? 0 : -1}
          onClick={() => open({ source: 'sticky-cta' })}
        >
          <Glyph d="M4 6.5h16v11H4ZM4.5 7l7.5 6 7.5-6" />
          Enquire
        </button>
      )}
      {tel && (
        <a className={styles.tab} href={tel} tabIndex={shown ? 0 : -1} aria-label="Call the sales team">
          <Glyph d="M8.2 3.8 6 4.3a2 2 0 0 0-1.5 2.1c.6 7 6.1 12.5 13.1 13.1a2 2 0 0 0 2.1-1.5l.5-2.2a1 1 0 0 0-.6-1.1l-3-1.3a1 1 0 0 0-1.1.2l-1.3 1.3a10 10 0 0 1-4.9-4.9l1.3-1.3a1 1 0 0 0 .2-1.1l-1.3-3a1 1 0 0 0-1.1-.6Z" />
          Call
        </a>
      )}
      {wa ? (
        <a className={styles.tab} href={wa} target="_blank" rel="noopener noreferrer" tabIndex={shown ? 0 : -1}>
          <Glyph d="M4.5 19.5 5.6 16A7.8 7.8 0 1 1 8.4 18.6ZM9.2 8.6c0 3 2.9 6.2 6 6.2l1-1.3-1.9-1-.9.8a4.4 4.4 0 0 1-2-2l.8-.9-1-1.9Z" />
          WhatsApp
        </a>
      ) : (
        <button
          type="button"
          className={styles.tab}
          tabIndex={shown ? 0 : -1}
          onClick={() => open({ channel: 'whatsapp', source: 'sticky-cta' })}
        >
          <Glyph d="M4.5 19.5 5.6 16A7.8 7.8 0 1 1 8.4 18.6Z" />
          WhatsApp
        </button>
      )}
    </div>
  );
}

function Glyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}
