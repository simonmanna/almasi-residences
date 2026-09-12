import { copy, getDevelopment, getPagesSafe } from '../../lib/api';
import { addressLines, contactFrom, mailtoHref, telHref, whatsappHref } from '../../lib/contact';
import { twoLines } from '../../lib/text';
import { EnquiryForm } from '../enquiry/EnquiryForm';
import { RevealText } from '../ui/RevealText';
import styles from './EnquireSection.module.css';

const DEFAULT_TITLE = 'Arrange a private viewing.';
const DEFAULT_BODY =
  'Viewings are by appointment with the sales team. Tell us which residences interest you and when suits you, and we will reply within one working day.';

/**
 * 11 — the enquiry, in the page rather than behind a button. The heading and
 * text come from the CMS (Contact information), the channels from the property.
 */
export async function EnquireSection({
  id = 'enquire',
  heading,
  source = 'home',
}: {
  id?: string;
  heading?: string[];
  source?: string;
}) {
  const [dev, pages] = await Promise.all([getDevelopment().catch(() => null), getPagesSafe()]);
  const contact = contactFrom(dev?.contact);
  const wa = whatsappHref(contact);
  const tel = telHref(contact);
  const mail = mailtoHref(contact);
  const lines = heading ?? twoLines(copy(pages, 'contact', 'enquireTitle', DEFAULT_TITLE));

  return (
    <section id={id} className={`section ${styles.section}`} data-hide-sticky-cta aria-labelledby={`${id}-title`}>
      <div className={`container ${styles.layout}`}>
        <div className={styles.text}>
          <p className={`mark ${styles.kicker}`}>Enquire</p>
          <RevealText as="h2" id={`${id}-title`} className="h2" lines={lines} />
          <p className="lead">{copy(pages, 'contact', 'enquireBody', DEFAULT_BODY)}</p>
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
              <address>{addressLines(contact).join(', ')}</address>
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
