import type { Metadata } from 'next';
import { getDevelopment } from '../../lib/api';
import { pageMetadata } from '../../lib/page-metadata';
import { contactFrom, mailtoHref, telHref } from '../../lib/contact';
import { PageHeader } from '../../components/layout/PageHero';
import { SiteFooter } from '../../components/layout/SiteFooter';
import styles from '../legal.module.css';

export const revalidate = 86400;

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata('/privacy', { title: 'Privacy' });
}

/**
 * The enquiry form promises that details are kept for 24 months and never
 * sold; this is the page that promise points at. Everything here describes
 * what the code actually does — the enquiry intake (§5.7), the retention rule
 * in EnquiryService, and the first-party analytics in lib/analytics.
 *
 * TODO(legal): the data-controller entity and the supervisory authority named
 * under "Your choices" should be confirmed by counsel before launch.
 */
export default async function PrivacyPage() {
  const dev = await getDevelopment().catch(() => null);
  const contact = contactFrom(dev?.contact, dev?.name);
  const name = dev?.name ?? 'this development';
  const controller = dev?.developerName ?? dev?.name ?? null;
  const mail = mailtoHref(contact, 'Privacy request');
  const tel = telHref(contact);

  return (
    <main id="main">
      <PageHeader
        kicker="Privacy"
        title="How we handle your details"
        lede={`What ${name} collects when you enquire, why we need it, and how long we keep it.`}
      />

      <div className={`container ${styles.prose}`}>
        <section aria-labelledby="collect-title">
          <h2 id="collect-title" className="h3">
            What we collect
          </h2>
          <p>Only what an enquiry needs in order to be answered:</p>
          <ul>
            <li>Your name, email address and telephone number.</li>
            <li>What you asked for — a viewing, information, a reservation or a broker enquiry.</li>
            <li>Any residence you named, and any message you wrote.</li>
            <li>A preferred day and time of day, if you asked for a viewing.</li>
            <li>How you prefer to be contacted.</li>
            <li>
              How you arrived: the page you were on, the site that referred you, and any campaign
              tags in the link you followed.
            </li>
            <li>
              Your IP address and browser identifier, used to check that a submission is not
              automated and then kept with the enquiry record.
            </li>
          </ul>
          <p>
            We do not ask for financial details through this website, and we never request payment
            information by email.
          </p>
        </section>

        <section aria-labelledby="why-title">
          <h2 id="why-title" className="h3">
            Why we need it
          </h2>
          <p>
            To reply to you, to arrange a viewing, and to keep a record of the conversation so that
            whoever picks it up next knows what was already discussed. If the same person enquires
            again within a day, the new message joins the existing record rather than starting a
            second one.
          </p>
        </section>

        <section aria-labelledby="shared-title">
          <h2 id="shared-title" className="h3">
            Who else sees it
          </h2>
          <dl>
            <div>
              <dt>Our email provider</dt>
              <dd>
                Your confirmation email and the notification to the sales team are delivered by a
                transactional email service. It handles the message in order to send it.
              </dd>
            </div>
          </dl>
          <p>
            Nobody else. We do not sell your details, we do not share them with advertisers, and we
            do not add you to a mailing list you did not ask for.
          </p>
        </section>

        <section aria-labelledby="analytics-title">
          <h2 id="analytics-title" className="h3">
            Measurement
          </h2>
          <p>
            We count how the website is used — which residences are opened, which floor plans are
            viewed, which enquiries begin. This is measured by our own server, not by a third party.
            There is no advertising cookie and no cross-site tracking, so there is no consent banner
            to dismiss. A visit is identified by a random value held in your browser tab for the
            length of that visit and discarded when you close it.
          </p>
        </section>

        <section aria-labelledby="keep-title">
          <h2 id="keep-title" className="h3">
            How long we keep it
          </h2>
          <p>
            An enquiry is deleted permanently 24 months after the last change to its status. If you
            would like it removed sooner, ask us and we will do it.
          </p>
        </section>

        <section aria-labelledby="rights-title">
          <h2 id="rights-title" className="h3">
            Your choices
          </h2>
          <p>
            You may ask what we hold about you, ask us to correct it, or ask us to delete it. Write
            to us and we will respond.
          </p>
          <ul>
            {controller && <li>Data controller: {controller}</li>}
            {contact.email && (
              <li>
                Email: {mail ? <a className="link-line" href={mail}>{contact.email}</a> : contact.email}
              </li>
            )}
            {contact.phone && (
              <li>
                Telephone: {tel ? <a className="link-line" href={tel}>{contact.phone}</a> : contact.phone}
              </li>
            )}
            {contact.officeAddress && <li>Address: {contact.officeAddress}</li>}
          </ul>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
