import Link from 'next/link';
import { getDevelopment } from '../../lib/api';
import { addressLines, contactFrom, mailtoHref, telHref, whatsappHref } from '../../lib/contact';
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

const SOCIAL_LABEL: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn', youtube: 'YouTube', x: 'X', tiktok: 'TikTok' };

/** Contact details come from the property record the admin edits (§21), not from this file. */
export async function SiteFooter() {
  const dev = await getDevelopment().catch(() => null);
  const contact = contactFrom(dev?.contact);
  const wa = whatsappHref(contact);
  const tel = telHref(contact);
  const mail = mailtoHref(contact);
  const socials = Object.entries(contact.socials);

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
              {addressLines(contact).map((line) => (
                <span key={line}>{line}</span>
              ))}
              {contact.officeHours && <span>{contact.officeHours}</span>}
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
              {tel && contact.phone && (
                <li>
                  <a href={tel}>{contact.phone}</a>
                </li>
              )}
              {mail && contact.email && (
                <li>
                  <a href={mail}>{contact.email}</a>
                </li>
              )}
              <li>
                <Link href="/enquire">Enquiry form</Link>
              </li>
              <li>
                <Link href="/enquire#viewing">Book a viewing</Link>
              </li>
              {socials.map(([k, url]) => (
                <li key={k}>
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    {SOCIAL_LABEL[k] ?? k}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className={styles.name} aria-hidden="true">
          Almasi Residences
        </p>

        <div className={styles.legal}>
          <p>
            Images are artist&rsquo;s impressions. Layouts, specification and prices are indicative and may
            change before contract.
          </p>
          <p>&copy; {new Date().getFullYear()} Almasi Residences, Kimihurura, Kigali</p>
        </div>
      </div>
    </footer>
  );
}
