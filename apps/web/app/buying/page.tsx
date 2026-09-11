import type { Metadata } from 'next';
import { formatPercent, formatQuarter } from '@avida/types';
import { getDevelopment } from '../../lib/api';
import { PageHeader } from '../../components/layout/PageHero';
import { PaymentTimeline } from '../../components/home/PaymentTimeline';
import { EnquireSection } from '../../components/home/EnquireSection';
import { SiteFooter } from '../../components/layout/SiteFooter';
import styles from './buying.module.css';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Buying — payment plan and process',
  description:
    'How to buy at Almasi Residences, Kigali: choose a residence, reserve it with the sales team, and pay in four stages tied to construction — 30% on signing, 30% at structure, 30% at tiling, 10% at handover in Q2 2028.',
  alternates: { canonical: '/buying' },
};

export default async function BuyingPage() {
  const dev = await getDevelopment().catch(() => null);
  const milestones = [...(dev?.milestones ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const handover = dev?.handoverDate ? formatQuarter(dev.handoverDate) : 'Q2 2028';
  const first = milestones[0];

  const steps = [
    {
      title: 'Choose',
      text: 'Find a residence in the explorer or with the sales team, who confirm that it is available.',
    },
    {
      title: 'Reserve',
      text: 'The sales team holds the residence for you while the agreement is prepared.',
    },
    {
      title: 'Sign',
      text: first
        ? `Sign the agreement and pay ${formatPercent(first.percent)} ${first.label.toLowerCase()}.`
        : 'Sign the agreement and pay the first stage.',
    },
    {
      title: 'Build',
      text: 'The balance falls due as construction reaches each stage, not on fixed dates.',
    },
    {
      title: 'Move in',
      text: `The final payment on handover, planned for ${handover}.`,
    },
  ];

  return (
    <main id="main">
      <PageHeader
        kicker="Buying"
        title={
          <>
            Buying at
            <br />
            <span className="italic">Almasi</span>
          </>
        }
        lede="Priced in US dollars, open to buyers in Rwanda and abroad, and paid in stages that follow the building as it rises."
      />

      <section className={`container ${styles.steps}`} aria-labelledby="steps-title">
        <h2 id="steps-title" className="h3">
          From enquiry to keys
        </h2>
        <ol className={styles.list}>
          {steps.map((s, i) => (
            <li key={s.title} className={styles.step}>
              <span className={`${styles.index} tabular`}>{String(i + 1).padStart(2, '0')}</span>
              <p className={styles.stepTitle}>{s.title}</p>
              <p className="muted">{s.text}</p>
            </li>
          ))}
        </ol>
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
