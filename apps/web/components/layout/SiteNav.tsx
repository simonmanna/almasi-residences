'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { telHref, whatsappHref } from '../../lib/contact';
import { useContact } from '../providers/ContactProvider';
import { useEnquiry } from '../enquiry/EnquiryProvider';
import { useLenis } from './SmoothScroll';
import { Wordmark } from './Wordmark';
import styles from './SiteNav.module.css';

export const NAV_LINKS = [
  { href: '/residences', label: 'Residences' },
  { href: '/tour', label: '3D tour' },
  { href: '/amenities', label: 'Amenities' },
  { href: '/location', label: 'Location' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/progress', label: 'Progress' },
  { href: '/buying', label: 'Buying' },
] as const;

type Mode = 'over' | 'solid' | 'clear';

/**
 * Transparent over cinematic imagery, solid once the page moves, out of the way
 * while scrolling down and back on the way up. A page marks its full-bleed
 * opening image with `data-nav-over`; pages on the night ground mark their
 * <main> with `data-nav-ground="night"`.
 */
export function SiteNav() {
  const pathname = usePathname();
  const { open } = useEnquiry();
  const lenis = useLenis();
  const menuRef = useRef<HTMLDialogElement>(null);
  const [overMedia, setOverMedia] = useState(false);
  const [pageGround, setPageGround] = useState<'stone' | 'night'>('stone');
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setPageGround(
      document.querySelector('[data-nav-ground="night"]') ? 'night' : 'stone',
    );
    const target = document.querySelector('[data-nav-over]');
    if (!target) {
      setOverMedia(false);
      return;
    }
    // "Over media" while the opening image still covers the strip the nav sits in.
    const io = new IntersectionObserver(([entry]) => setOverMedia(entry?.isIntersecting ?? false), {
      rootMargin: '0px 0px -92% 0px',
    });
    io.observe(target);
    return () => io.disconnect();
  }, [pathname]);

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 24);
      if (Math.abs(y - last) > 8) {
        setHidden(y > last && y > 520);
        last = y;
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    menuRef.current?.close();
  }, [pathname]);

  const mode: Mode = overMedia ? 'over' : scrolled ? 'solid' : 'clear';
  const ground = mode === 'over' ? 'night' : pageGround;

  const openMenu = () => {
    menuRef.current?.showModal();
    setMenuOpen(true);
    lenis?.stop();
  };

  const contact = useContact();
  const wa = whatsappHref(contact);
  const tel = telHref(contact);

  return (
    <header
      className={styles.nav}
      data-mode={mode}
      data-ground={ground}
      data-hidden={hidden && !menuOpen ? 'true' : 'false'}
    >
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} aria-label={contact.developmentName ? `${contact.developmentName}, home` : "Home"}>
          <Wordmark />
        </Link>

        <nav aria-label="Primary" className={styles.links}>
          <ul>
            {NAV_LINKS.map((l) => {
              const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
              return (
                <li key={l.href}>
                  <Link href={l.href} className={styles.link} aria-current={active ? 'page' : undefined}>
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className={styles.actions}>
          <button
            type="button"
            className={`btn btn--solid btn--sm ${styles.enquire}`}
            onClick={() => open({ source: 'nav' })}
          >
            Enquire
          </button>
          <button
            type="button"
            className={styles.menuButton}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            onClick={openMenu}
          >
            <span className={styles.menuIcon} aria-hidden="true" />
            <span className="mark">Menu</span>
          </button>
        </div>
      </div>

      <dialog
        id="site-menu"
        ref={menuRef}
        className={styles.menu}
        aria-label="Menu"
        data-ground="night"
        onClose={() => {
          setMenuOpen(false);
          lenis?.start();
        }}
      >
        <div className={styles.menuInner} data-lenis-prevent>
          <div className={styles.menuTop}>
            <Link href="/" className={styles.brand} aria-label={contact.developmentName ? `${contact.developmentName}, home` : "Home"}>
              <Wordmark />
            </Link>
            <button type="button" className={styles.menuClose} onClick={() => menuRef.current?.close()}>
              <span className="mark">Close</span>
            </button>
          </div>
          <nav aria-label="Menu">
            <ol className={styles.menuLinks}>
              {[{ href: '/', label: 'Home' }, ...NAV_LINKS].map((l, i) => (
                <li key={l.href} style={{ '--i': i } as React.CSSProperties}>
                  <Link href={l.href} className={styles.menuLink} onClick={() => menuRef.current?.close()}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
          <div className={styles.menuFoot}>
            <button
              type="button"
              className="btn btn--solid"
              onClick={() => {
                menuRef.current?.close();
                open({ source: 'menu' });
              }}
            >
              Enquire
            </button>
            {wa && (
              <a className="btn btn--ghost" href={wa} target="_blank" rel="noopener noreferrer">
                WhatsApp
              </a>
            )}
            {tel && contact.phone && (
              <a className="btn btn--ghost" href={tel}>
                {contact.phone}
              </a>
            )}
            <p className="caption">Kimihurura, Kigali, Rwanda</p>
          </div>
        </div>
      </dialog>
    </header>
  );
}
