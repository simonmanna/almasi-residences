import type { Metadata } from 'next';
import { formatDate } from '@avida/types';
import { getProgress } from '../../../lib/api';
import { PageHeader } from '../../../components/layout/PageHero';
import { SiteFooter } from '../../../components/layout/SiteFooter';
import styles from './progress.module.css';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Construction progress',
  description: 'Dated updates from the Almasi Residences site in Kimihurura as the building goes up.',
  alternates: { canonical: '/progress' },
};

/**
 * §9 Phase 6 — the section that answers "will they deliver" with evidence:
 * dated, specific, and the percentage as recorded rather than as a claim.
 */
export default async function ProgressPage() {
  const updates = await getProgress().catch(() => []);
  return (
    <main id="main">
      <PageHeader
        kicker="Construction"
        title={
          <>
            Progress,
            <br />
            <span className="italic">dated.</span>
          </>
        }
        lede="Updates from the site as the building goes up, each one dated and recorded as it happened."
      />
      <section className={`container ${styles.section}`} aria-label="Updates">
        {updates.length === 0 ? (
          <p className="lead">Updates appear here from the start of construction, dated and photographed.</p>
        ) : (
          <ol className={styles.list}>
            {updates.map((u) => (
              <li key={u.id} className={styles.item}>
                <p className={`${styles.date} tabular`}>{formatDate(u.capturedOn)}</p>
                <div className={styles.body}>
                  <h2 className="h3">{u.title}</h2>
                  {u.percentComplete !== null && (
                    <p className={styles.percent}>
                      <span className={styles.bar} aria-hidden="true">
                        <span style={{ width: `${u.percentComplete}%` }} />
                      </span>
                      <span className="tabular">{u.percentComplete}% complete</span>
                    </p>
                  )}
                  {u.bodyMd && <p className="body muted">{u.bodyMd}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}
