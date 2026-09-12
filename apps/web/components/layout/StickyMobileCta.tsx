'use client';

import { useEffect, useState } from 'react';
import { whatsappHref } from '../../lib/contact';
import { useContact } from '../providers/ContactProvider';
import { track } from '../../lib/analytics';
import { useEnquiry } from '../enquiry/EnquiryProvider';
import styles from './StickyMobileCta.module.css';

/**
 * Mobile only: once the opening image has passed, enquiry and WhatsApp stay a
 * thumb away. It steps aside wherever a page already offers the same actions
 * (elements marked `data-hide-sticky-cta`, such as the enquiry section and footer).
 */
export function StickyMobileCta() {
  const { open } = useEnquiry();
  const [past, setPast] = useState(false);
  const [suppressed, setSuppressed] = useState(false);

  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > window.innerHeight * 0.75);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

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
      window.removeEventListener('scroll', onScroll);
      io.disconnect();
      mo.disconnect();
    };
  }, []);

  const wa = whatsappHref(useContact());
  const shown = past && !suppressed;

  return (
    <div className={styles.bar} data-shown={shown ? 'true' : 'false'} data-ground="night" aria-hidden={!shown}>
      <button
        type="button"
        className="btn btn--solid"
        tabIndex={shown ? 0 : -1}
        onClick={() => open({ source: 'sticky-cta' })}
      >
        Enquire
      </button>
      {wa ? (
        <a
          className="btn btn--ghost"
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={shown ? 0 : -1}
          onClick={() => track('whatsapp_clicked', { source: 'sticky-cta' })}
        >
          WhatsApp
        </a>
      ) : (
        <button
          type="button"
          className="btn btn--ghost"
          tabIndex={shown ? 0 : -1}
          onClick={() => open({ channel: 'whatsapp', source: 'sticky-cta' })}
        >
          WhatsApp
        </button>
      )}
    </div>
  );
}
