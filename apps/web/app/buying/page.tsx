import type { Metadata } from 'next';
import { formatQuarter } from '@avida/types';
import { copy, copyLines, getDevelopment, getPagesSafe } from '../../lib/api';
import { pageMetadata } from '../../lib/page-metadata';
import { faqJsonLd } from '../../lib/seo';
import { PageHeader, TitleLines } from '../../components/layout/PageHero';
import { PaymentTimeline } from '../../components/home/PaymentTimeline';
import { EnquireSection } from '../../components/home/EnquireSection';
import { SiteFooter } from '../../components/layout/SiteFooter';
import styles from './buying.module.css';
import { assertPageVisible } from '../../lib/page-visibility';

export const revalidate = 3600;

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata('/buying', { title: 'Buying' });
}

type Step = { title: string; body: string };

/**
 * The purchase process is CMS copy (Buying guide, §21) with no fallback in
 * code; the milestones are the default payment plan's (§10), the questions the
 * published FAQs, and the people behind the project the property record's.
 */
export default async function BuyingPage() {
  await assertPageVisible('buying');

  const [dev, pages] = await Promise.all([getDevelopment().catch(() => null), getPagesSafe()]);
  const milestones = [...(dev?.milestones ?? [])].sort((x, y) => x.sortOrder - y.sortOrder);
  const handover = dev?.handoverDate ? formatQuarter(dev.handoverDate) : null;
  const cms = pages.buying?.processSteps;
  const steps = Array.isArray(cms) ? (cms as Step[]) : [];
  const reservation = copy(pages, 'buying', 'reservationBody');
  const abroad = copy(pages, 'buying', 'foreignBuyersBody');
  const people = [
    { role: 'Developer', name: dev?.developerName },
    { role: 'Architect', name: dev?.architect },
    { role: 'Contractor', name: dev?.contractor },
  ].filter((x): x is { role: string; name: string } => Boolean(x.name));
  const developerBody = copy(pages, 'about', 'developerBody');
  const architectureBody = copy(pages, 'about', 'architectureBody');

  return (
    <main id="main">
      {dev && dev.faqs.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(dev.faqs)) }}
        />
      )}
<PageHeader
        bold
        kicker={copy(pages, 'buying', 'heroKicker')}
        title={<TitleLines lines={copyLines(pages, 'buying', 'heroTitle')} />}
        lede={copy(pages, 'buying', 'heroLede')}
/>

      {steps.length > 0 && (
      <section className={`container ground-band ${styles.steps}`} data-ground="quiet" aria-labelledby="steps-title">
        <h2 id="steps-title" className="h3">
          From enquiry to keys
        </h2>
        <ol className={styles.list}>
          {steps.map((s, i) => (
            <li key={`${s.title}-${i}`} className={styles.step}>
              <span className={`${styles.index} tabular`}>{String(i + 1).padStart(2, '0')}</span>
              <p className={styles.stepTitle}>{s.title}</p>
              <p className="muted">{s.body}</p>
            </li>
          ))}
        </ol>
        {(reservation || abroad) && (
          <div className={styles.questions} style={{ marginTop: 32 }}>
            {reservation && (
              <details className={styles.question} open>
                <summary>Reserving a residence</summary>
                <p>{reservation}</p>
              </details>
            )}
            {abroad && (
              <details className={styles.question}>
                <summary>Buying from abroad</summary>
                <p>{abroad}</p>
              </details>
            )}
          </div>
        )}
      </section>
      )}

      {people.length > 0 && (
        <section className={`section container ground-band ${styles.faq}`} data-ground="night" aria-labelledby="people-title">
          <h2 id="people-title" className="h2">
            {copy(pages, 'about', 'developerTitle') || 'Who is building it'}
          </h2>
          <dl className={styles.people}>
            {people.map((x) => (
              <div key={x.role}>
                <dt className="mark">{x.role}</dt>
                <dd className="h3">{x.name}</dd>
              </div>
            ))}
          </dl>
          {developerBody && <p className="lead">{developerBody}</p>}
          {architectureBody && <p className="body muted">{architectureBody}</p>}
        </section>
      )}

      <PaymentTimeline milestones={milestones} handover={handover} ground="quiet" />

      {dev && dev.faqs.length > 0 && (
        <section className={`section container ground-band ${styles.faq}`} data-ground="night" aria-labelledby="faq-title">
          <h2 id="faq-title" className="h2">
            Questions
          </h2>
          <div className={styles.questions}>
            {dev.faqs.map((f) => (
              <details key={f.id} className={styles.question}>
                <summary>{f.question}</summary>
                <p>{f.answerMd}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      <EnquireSection source="buying" heading={['Talk to', 'the sales team.']} compact ground="quiet" />
      <SiteFooter />
    </main>
  );
}
