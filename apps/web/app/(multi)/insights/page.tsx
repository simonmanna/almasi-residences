import type { Metadata } from 'next';
import Link from 'next/link';
import { formatDate } from '@avida/types';
import { getInsights } from '../../../lib/api';
import { pageMetadata } from '../../../lib/page-metadata';
import { PageHeader, TitleLines } from '../../../components/layout/PageHero';
import { Breadcrumbs } from '../../../components/layout/Breadcrumbs';
import { SceneImage } from '../../../components/ui/SceneImage';
import { SiteFooter } from '../../../components/layout/SiteFooter';
import styles from './insights.module.css';

export const revalidate = 3600;

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata('/insights');
}

/**
 * §SEO — the guides and neighbourhood writing. Each article answers a question
 * a buyer actually asks; the index exists so those answers are linked from
 * somewhere and can be found.
 */
export default async function InsightsPage() {
  const posts = await getInsights().catch(() => []);
  const categories = [...new Set(posts.map((p) => p.category))];

  return (
    <main id="main">
      <PageHeader
        kicker="Insights"
        title={<TitleLines lines={['Guides to buying', 'and living here.']} />}
        lede="What buying in Kigali involves, what each neighbourhood is like, and how the building is progressing."
      />
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Insights', path: '/insights' }]} />
      <section className={`container ground-band ${styles.section}`} data-ground="quiet" aria-label="Articles">
        {posts.length === 0 ? (
          <p className="lead">The first guides are being written.</p>
        ) : (
          <>
            {categories.length > 1 && (
              <ul className={styles.filters} aria-label="Subjects">
                {categories.map((c) => (
                  <li key={c}>
                    <a className="link-line" href={`#${c.toLowerCase()}`}>
                      {c}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <ul className={styles.grid}>
              {posts.map((p) => (
                <li key={p.id} id={p.category.toLowerCase()} className={styles.item} data-reveal>
                  <Link href={`/insights/${p.slug}`} className={styles.card} data-cursor="Read">
                    <div className={styles.media}>
                      <SceneImage media={p.hero} sizes="(max-width: 900px) 100vw, 33vw" label={p.title} />
                    </div>
                    <div className={styles.text}>
                      <p className="eyebrow">{p.category}</p>
                      <h2 className="h3">{p.title}</h2>
                      {p.excerpt && <p className="body muted">{p.excerpt}</p>}
                      <p className={styles.meta}>
                        {p.publishedAt && <span className="tabular">{formatDate(p.publishedAt)}</span>}
                        {p.readMinutes && <span className="tabular">{p.readMinutes} min read</span>}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}
