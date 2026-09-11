import { ADDRESS_LINES, SALES, mailtoHref, telHref, whatsappHref } from '../../lib/contact';
import { EnquiryForm } from '../enquiry/EnquiryForm';
import { RevealText } from '../ui/RevealText';
import styles from './EnquireSection.module.css';

/** 11 — the enquiry, in the page rather than behind a button. */
export function EnquireSection({
  id = 'enquire',
  heading = ['Arrange a', 'private viewing.'],
  source = 'home',
}: {
  id?: string;
  heading?: string[];
  source?: string;
}) {
  const wa = whatsappHref();
  const tel = telHref();
  const mail = mailtoHref();

  return (
    <section id={id} className={`section ${styles.section}`} data-hide-sticky-cta aria-labelledby={`${id}-title`}>
      <div className={`container ${styles.layout}`}>
        <div className={styles.text}>
          <p className={`mark ${styles.kicker}`}>Enquire</p>
          <RevealText as="h2" id={`${id}-title`} className="h2" lines={heading} />
          <p className="lead">
            Viewings are by appointment with the sales team. Tell us which residences interest you and
            when suits you, and we will reply within one working day.
          </p>
          <ul className={styles.channels}>
            {wa && (
              <li>
                <span className={styles.label}>WhatsApp</span>
                <a className="link-line" href={wa} target="_blank" rel="noopener noreferrer">
                  Message the sales team
                </a>
              </li>
            )}
            {tel && SALES.phone && (
              <li>
                <span className={styles.label}>Telephone</span>
                <a className="link-line" href={tel}>
                  {SALES.phone}
                </a>
              </li>
            )}
            {mail && SALES.email && (
              <li>
                <span className={styles.label}>Email</span>
                <a className="link-line" href={mail}>
                  {SALES.email}
                </a>
              </li>
            )}
            <li>
              <span className={styles.label}>Address</span>
              <address>{ADDRESS_LINES.join(', ')}</address>
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
