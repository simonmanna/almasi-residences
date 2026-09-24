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

const LEGAL_LINKS = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms of use' },
];

const SOCIAL_LABEL: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn', youtube: 'YouTube', x: 'X', tiktok: 'TikTok' };

/** Contact details come from the property record the admin edits (§21), not from this file. */
export async function SiteFooter() {
  const dev = await getDevelopment().catch(() => null);
  const contact = contactFrom(dev?.contact, dev?.name);
  const wa = whatsappHref(contact);
  const tel = telHref(contact);
  const mail = mailtoHref(contact);
  const socials = Object.entries(contact.socials);
  const name = dev?.name ?? '';
  // Who is actually building this: a buyer sending money abroad looks for it.
  const credits = [
    { role: 'Developer', value: dev?.developerName },
    { role: 'Architect', value: dev?.architect },
    { role: 'Contractor', value: dev?.contractor },
  ].filter((c): c is { role: string; value: string } => Boolean(c.value));

  return (
    <footer className={styles.footer} data-ground="night" data-hide-sticky-cta>
      <div className="container">
        <div className={styles.grid}>
          <div>
            <Link href="/" aria-label={name ? `${name}, home` : "Home"}>
              <Wordmark />
            </Link>
            <address className={styles.address}>
              {contact.mapsUrl ? (
                <a href={contact.mapsUrl} target="_blank" rel="noopener noreferrer" aria-label={`${contact.officeAddress}, open in Google Maps`}>
                  {addressLines(contact).map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </a>
              ) : (
                addressLines(contact).map((line) => <span key={line}>{line}</span>)
              )}
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
            </ul>
            {socials.length > 0 && (
              <ul className={styles.socials} aria-label="Social media">
                {socials.map(([k, url]) => (
                  <li key={k}>
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      {SOCIAL_LABEL[k] ?? k}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <EnquireButton request={{ source: 'footer' }}>Enquire</EnquireButton>

          </div>
        </div>

        {credits.length > 0 && (
          <dl className={styles.credits}>
            {credits.map((c) => (
              <div key={c.role}>
                <dt>{c.role}</dt>
                <dd>{c.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {name && (
          // Incidental under WCAG 1.4.3: a ghosted watermark of the wordmark
          // already shown above it, carrying no information of its own.
          <p className={styles.name} aria-hidden="true" data-decorative="true">
            {name}
          </p>
        )}

        <div className={styles.legal}>
          <ul className={styles.legalLinks}>
            {LEGAL_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href}>{l.label}</Link>
              </li>
            ))}
          </ul>
          <p>
            &copy; {new Date().getFullYear()}
            {name ? ` ${name}` : ''}
            {contact.officeAddress ? `, ${contact.officeAddress}` : ''}
          </p>
        </div>
      </div>
    </footer>
  );
}
