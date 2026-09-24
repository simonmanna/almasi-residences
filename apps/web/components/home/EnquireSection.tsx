import { copy, getDevelopment, getPagesSafe } from '../../lib/api';
import { addressLines, contactFrom, mailtoHref, telHref, whatsappHref } from '../../lib/contact';
import { titleCaseHeading, twoLines } from '../../lib/text';
import { EnquiryForm } from '../enquiry/EnquiryForm';
import { RevealText } from '../ui/RevealText';
import styles from './EnquireSection.module.css';

/**
 * 11 — the enquiry, in the page rather than behind a button. The heading and
 * text come from the CMS (Contact information), the channels from the property.
 */
export async function EnquireSection({
  id = 'enquire',
  heading,
  source = 'home',
  compact = false,
  ground,
}: {
  id?: string;
  heading?: string[];
  source?: string;
  /** Sets the heading on one line at near-lead size, under a large kicker. */
  compact?: boolean;
  ground?: 'stone' | 'quiet' | 'night';
}) {
  const [dev, pages] = await Promise.all([getDevelopment().catch(() => null), getPagesSafe()]);
  const contact = contactFrom(dev?.contact, dev?.name);
  const wa = whatsappHref(contact);
  const tel = telHref(contact);
  const mail = mailtoHref(contact);
  const title = (heading ?? twoLines(copy(pages, 'contact', 'enquireTitle'))).map(titleCaseHeading);
  const lines = compact ? [title.join(' ')] : title;
  const body = copy(pages, 'contact', 'enquireBody');

  return (
    <section id={id} className={`section ${styles.section}${compact ? ` ${styles.compact}` : ''}`} data-ground={ground} data-hide-sticky-cta aria-labelledby={`${id}-title`}>
      <div className={`container ${styles.layout}`}>
        <div className={styles.text}>
          <p className={`mark ${styles.kicker}${compact ? ' kicker-lg' : ''}`}>Enquire</p>
          <RevealText as="h2" id={`${id}-title`} className={compact ? 'title-sm' : 'h2'} lines={lines} />
          {body && <p className="lead">{body}</p>}
          <ul className={styles.channels}>
            {wa && (
              <li>
                <span className={styles.label}>WhatsApp</span>
                <a className="link-line" href={wa} target="_blank" rel="noopener noreferrer">
                  Message the sales team
                </a>
              </li>
            )}
            {tel && contact.phone && (
              <li>
                <span className={styles.label}>Telephone</span>
                <a className="link-line" href={tel}>
                  {contact.phone}
                </a>
              </li>
            )}
            {mail && contact.email && (
              <li>
                <span className={styles.label}>Email</span>
                <a className="link-line" href={mail}>
                  {contact.email}
                </a>
              </li>
            )}
            <li>
              <span className={styles.label}>Address</span>
              <address>
                {contact.mapsUrl ? (
                  <a className="link-line" href={contact.mapsUrl} target="_blank" rel="noopener noreferrer">
                    {addressLines(contact).join(', ')}
                  </a>
                ) : (
                  addressLines(contact).join(', ')
                )}
              </address>
            </li>
          </ul>
        </div>
        <div className={styles.form} id="viewing">
          <EnquiryForm intent="VIEWING" source={source} />
        </div>
      </div>
    </section>
  );
}
