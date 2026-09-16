import type { Metadata } from 'next';
import { getDevelopment } from '../../lib/api';
import { pageMetadata } from '../../lib/page-metadata';
import { contactFrom, mailtoHref } from '../../lib/contact';
import { PageHeader } from '../../components/layout/PageHero';
import { SiteFooter } from '../../components/layout/SiteFooter';
import styles from '../legal.module.css';

export const revalidate = 86400;

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata('/terms', { title: 'Terms of use' });
}

/**
 * The disclaimers the site already repeats next to every rendered image and
 * every price, gathered in one place a buyer can cite.
 *
 * TODO(legal): governing law and dispute resolution are deliberately left to
 * counsel; everything above them states what the site itself does.
 */
export default async function TermsPage() {
  const dev = await getDevelopment().catch(() => null);
  const contact = contactFrom(dev?.contact, dev?.name);
  const name = dev?.name ?? 'this development';
  const developer = dev?.developerName ?? null;
  const mail = mailtoHref(contact, 'Website terms');

  return (
    <main id="main">
      <PageHeader
        kicker="Terms"
        title="Terms of use"
        lede={`What the information on the ${name} website does and does not commit us to.`}
      />

      <div className={`container ${styles.prose}`}>
        <section aria-labelledby="images-title">
          <h2 id="images-title" className="h3">
            Images and drawings
          </h2>
          <p>
            Photographs of interiors and exteriors on this website are artist’s impressions of a
            residence type, furnished for illustration. They show intent, not a finished room.
            Finishes, fittings, furniture and landscaping are indicative. Floor plans are drawn to
            describe a layout, not to be measured from.
          </p>
        </section>

        <section aria-labelledby="price-title">
          <h2 id="price-title" className="h3">
            Prices and availability
          </h2>
          <p>
            Availability shown on this website is read from the sales team’s own records and
            refreshes continuously, but a residence can be reserved between the moment a page is
            loaded and the moment an enquiry reaches us. Nothing here reserves a residence.
          </p>
          <p>
            Prices are indicative, quoted in the currency shown, exclusive of taxes, duties and
            registration costs unless stated otherwise, and may change before contract. A price on
            this website is an invitation to enquire. It is not an offer capable of acceptance and
            it does not form part of any contract.
          </p>
        </section>

        <section aria-labelledby="spec-title">
          <h2 id="spec-title" className="h3">
            Specification
          </h2>
          <p>
            Areas, dimensions, orientations, room counts and specifications are indicative and may
            be adjusted as construction proceeds. The specification that binds either party is the
            one set out in the sale contract. Where this website and the sale contract differ, the
            sale contract governs.
          </p>
        </section>

        <section aria-labelledby="progress-title">
          <h2 id="progress-title" className="h3">
            Construction and handover
          </h2>
          <p>
            Construction updates and any handover date shown are the current expectation and are not
            a guarantee. Payment stages are tied to stages of construction rather than to calendar
            dates.
          </p>
        </section>

        <section aria-labelledby="use-title">
          <h2 id="use-title" className="h3">
            Using this website
          </h2>
          <p>
            The text, images, drawings and models on this website belong to{' '}
            {developer ?? 'the developer'} or its licensors. You are welcome to read, print and
            share pages for your own consideration of a purchase. Republishing the imagery or using
            it commercially requires our written permission.
          </p>
          <p>
            We aim to keep the website accurate and available, but we do not warrant that it will be
            uninterrupted or error-free.
          </p>
        </section>

        <section aria-labelledby="contact-title">
          <h2 id="contact-title" className="h3">
            Questions
          </h2>
          <p>
            If anything here is unclear, or if you think something on the website is wrong, please
            tell us{' '}
            {mail && contact.email ? (
              <>
                at{' '}
                <a className="link-line" href={mail}>
                  {contact.email}
                </a>
              </>
            ) : (
              'through the enquiry form'
            )}{' '}
            and we will correct it.
          </p>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
