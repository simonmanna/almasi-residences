import type { Metadata } from 'next';
import { formatPercent, formatQuarter } from '@avida/types';
import { copy, getDevelopment, getPagesSafe } from '../../lib/api';
import { twoLines } from '../../lib/text';
import { PageHeader } from '../../components/layout/PageHero';
import { PaymentTimeline } from '../../components/home/PaymentTimeline';
import { EnquireSection } from '../../components/home/EnquireSection';
import { SiteFooter } from '../../components/layout/SiteFooter';
import styles from './buying.module.css';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Buying — payment plan and process',
  description:
    'How to buy at Almasi Residences, Kigali: choose a residence, reserve it with the sales team, and pay in stages tied to construction.',
  alternates: { canonical: '/buying' },
};

type Step = { title: string; body: string };

/**
 * The purchase process is CMS copy (Buying guide, §21); the milestones are the
 * default payment plan's (§10) and the questions the published FAQs.
 */
export default async function BuyingPage() {
  const [dev, pages] = await Promise.all([getDevelopment().catch(() => null), getPagesSafe()]);
  const milestones = [...(dev?.milestones ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const handover = dev?.handoverDate ? formatQuarter(dev.handoverDate) : 'Q2 2028';
  const first = milestones[0];

  const fallbackSteps: Step[] = [
    { title: 'Choose', body: 'Find a residence in the explorer or with the sales team, who confirm that it is available.' },
    { title: 'Reserve', body: 'The sales team holds the residence for you while the agreement is prepared.' },
    { title: 'Sign', body: first ? `Sign the agreement and pay ${formatPercent(first.percent)} ${first.label.toLowerCase()}.` : 'Sign the agreement and pay the first stage.' },
    { title: 'Build', body: 'The balance falls due as construction reaches each stage, not on fixed dates.' },
    { title: 'Move in', body: `The final payment on handover, planned for ${handover}.` },
  ];
  const cms = pages.buying?.processSteps;
  const steps = Array.isArray(cms) && cms.length ? (cms as Step[]) : fallbackSteps;
  const [a, b] = twoLines(copy(pages, 'buying', 'heroTitle', 'Buying at Almasi'));
  const reservation = copy(pages, 'buying', 'reservationBody', '');
  const abroad = copy(pages, 'buying', 'foreignBuyersBody', '');

  return (
    <main id="main">
      <PageHeader
        kicker="Buying"
        title={
          <>
            {a}
            {b && (
              <>
                <br />
                <span className="italic">{b}</span>
              </>
            )}
          </>
        }
        lede={copy(pages, 'buying', 'heroLede', 'Priced in US dollars, open to buyers in Rwanda and abroad, and paid in stages that follow the building as it rises.')}
      />

      <section className={`container ${styles.steps}`} aria-labelledby="steps-title">
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

      <PaymentTimeline milestones={milestones} handover={handover} />

      {dev && dev.faqs.length > 0 && (
        <section className={`section container ${styles.faq}`} aria-labelledby="faq-title">
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

      <EnquireSection source="buying" heading={['Talk to', 'the sales team.']} />
      <SiteFooter />
    </main>
  );
}
