import type { Metadata } from 'next';
import { formatDate } from '@avida/types';
import { copy, copyLines, getPagesSafe, getProgress } from '../../../lib/api';
import { pageMetadata } from '../../../lib/page-metadata';
import { PageHeader, TitleLines } from '../../../components/layout/PageHero';
import { SiteFooter } from '../../../components/layout/SiteFooter';
import styles from './progress.module.css';
import { assertPageVisible } from '../../../lib/page-visibility';

export const revalidate = 3600;

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata('/progress', { title: 'Construction progress' });
}

/**
 * §9 Phase 6 — the section that answers "will they deliver" with evidence:
 * dated, specific, and the percentage as recorded rather than as a claim.
 */
export default async function ProgressPage() {
  await assertPageVisible('progress');

  const [updates, pages] = await Promise.all([getProgress().catch(() => []), getPagesSafe()]);
  const empty = copy(pages, 'progress', 'emptyText');
  return (
    <main id="main">
      <PageHeader
        kicker={copy(pages, 'progress', 'heroKicker')}
        title={<TitleLines lines={copyLines(pages, 'progress', 'heroTitle')} />}
        lede={copy(pages, 'progress', 'heroLede')}
      />
      <section className={`container ground-band ${styles.section}`} data-ground="quiet" aria-label="Updates">
        {updates.length === 0 ? (
          empty && <p className="lead">{empty}</p>
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
