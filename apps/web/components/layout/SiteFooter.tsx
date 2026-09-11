import Link from 'next/link';
import { ADDRESS_LINES, SALES, mailtoHref, telHref, whatsappHref } from '../../lib/contact';
import { EnquireButton } from '../enquiry/ContactActions';
import { Wordmark } from './Wordmark';
import styles from './SiteFooter.module.css';

const RESIDENCE_LINKS = [
  { href: '/residences', label: 'Residences' },
  { href: '/amenities', label: 'Amenities' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/buying', label: 'Buying' },
  { href: '/enquire', label: 'Contact' },
];

const EXPLORE_LINKS = [
  { href: '/tour', label: 'The building tour' },
  { href: '/tour/penthouse', label: 'The penthouse tour' },
  { href: '/film', label: 'The film' },
  { href: '/location', label: 'Location' },
];

export function SiteFooter() {
  const wa = whatsappHref();
  const tel = telHref();
  const mail = mailtoHref();

  return (
    <footer className={styles.footer} data-ground="night" data-hide-sticky-cta>
      <div className="container">
        <div className={styles.top}>
          <p className={styles.statement}>
            <span className="italic">Private residences.</span>
            <br />
            Distinctly Kigali.
          </p>
          <EnquireButton request={{ source: 'footer' }}>Enquire</EnquireButton>
        </div>

        <div className={styles.grid}>
          <div>
            <Link href="/" aria-label="Almasi Residences, home">
              <Wordmark />
            </Link>
            <address className={styles.address}>
              {ADDRESS_LINES.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </address>
          </div>

          <nav aria-label="Residences">
            <p className="mark muted">The residences</p>
            <ul>
              {RESIDENCE_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Explore">
            <p className="mark muted">Explore</p>
            <ul>
              {EXPLORE_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <p className="mark muted">Talk to us</p>
            <ul>
              {wa && (
                <li>
                  <a href={wa} target="_blank" rel="noopener noreferrer">
                    WhatsApp
                  </a>
                </li>
              )}
              {tel && SALES.phone && (
                <li>
                  <a href={tel}>{SALES.phone}</a>
                </li>
              )}
              {mail && SALES.email && (
                <li>
                  <a href={mail}>{SALES.email}</a>
                </li>
              )}
              <li>
                <Link href="/enquire">Enquiry form</Link>
              </li>
              <li>
                <Link href="/enquire#viewing">Book a viewing</Link>
              </li>
            </ul>
          </div>
        </div>

        <p className={styles.name} aria-hidden="true">
          Almasi Residences
        </p>

        <div className={styles.legal}>
          <p>
            Images are artist&rsquo;s impressions. Layouts, specification and prices are indicative and may
            change before contract. Handover is planned for Q2 2028.
          </p>
          <p>&copy; {new Date().getFullYear()} Almasi Residences, Kimihurura, Kigali</p>
        </div>
      </div>
    </footer>
  );
}
