import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDate } from '@avida/types';
import { getDevelopment, getInsight, getInsights } from '../../../../lib/api';
import { entityMetadata } from '../../../../lib/page-metadata';
import { plainText, renderMarkdown } from '../../../../lib/markdown';
import { articleJsonLd } from '../../../../lib/seo';
import { Breadcrumbs } from '../../../../components/layout/Breadcrumbs';
import { SceneImage } from '../../../../components/ui/SceneImage';
import { EnquireSection } from '../../../../components/home/EnquireSection';
import { SiteFooter } from '../../../../components/layout/SiteFooter';
import styles from '../insights.module.css';

export const revalidate = 3600;

/** One page per published article; a new one appears at the next revalidation. */
export async function generateStaticParams() {
  try {
    return (await getInsights()).map((p) => ({ slug: p.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getInsight(slug).catch(() => null);
  if (!post) notFound();
  return entityMetadata({
    path: `/insights/${post.slug}`,
    derivedTitle: post.title,
    derivedDescription: post.excerpt ?? plainText(post.body, 170),
    image: post.hero,
    seo: post.seo,
    type: 'article',
    publishedTime: post.publishedAt,
    modifiedTime: post.updatedAt,
  });
}

export default async function InsightPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [post, dev] = await Promise.all([getInsight(slug).catch(() => null), getDevelopment().catch(() => null)]);
  if (!post) notFound();

  return (
    <main id="main">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd(post, dev?.name ?? 'Almasi Residences')) }}
      />
      <header className={`container ground-band ${styles.articleHead}`} data-ground="night" data-nav-over>
        <p className="mark">{post.category}</p>
        <h1 id="page-title" className="display">
          {post.title}
        </h1>
        {post.excerpt && <p className="lead">{post.excerpt}</p>}
        <p className={styles.meta}>
          {post.authorName && <span>{post.authorName}</span>}
          {post.publishedAt && <span className="tabular">{formatDate(post.publishedAt)}</span>}
          {post.readMinutes && <span className="tabular">{post.readMinutes} min read</span>}
        </p>
      </header>
      <Breadcrumbs
        items={[
          { name: 'Home', path: '/' },
          { name: 'Insights', path: '/insights' },
          { name: post.title, path: `/insights/${post.slug}` },
        ]}
      />
      {post.hero && (
        <div className={`container ${styles.articleMedia}`}>
          <SceneImage media={post.hero} priority sizes="100vw" label={post.title} />
        </div>
      )}
      <article className={`container ${styles.prose}`}>{renderMarkdown(post.body)}</article>
      {post.tags.length > 0 && (
        <ul className={`container ${styles.tags}`} aria-label="Subjects">
          {post.tags.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      {/* §SEO — a page nothing links onwards from is a dead end for readers
          and crawlers alike; related reading and the residences both follow. */}
      <section className={`container ground-band ${styles.section}`} data-ground="quiet" aria-labelledby="related-title">
        <h2 id="related-title" className="title-xs">
          Keep reading
        </h2>
        <ul className={styles.grid}>
          {post.related.map((r) => (
            <li key={r.id} className={styles.item}>
              <Link href={`/insights/${r.slug}`} className={styles.card} data-cursor="Read">
                <div className={styles.media}>
                  <SceneImage media={r.hero} sizes="(max-width: 900px) 100vw, 33vw" label={r.title} />
                </div>
                <div className={styles.text}>
                  <p className="eyebrow">{r.category}</p>
                  <h3 className="h3">{r.title}</h3>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <p className={styles.onward}>
          <Link href="/residences" className="link-line">
            See every residence
          </Link>
          <Link href="/locations" className="link-line">
            Explore the neighbourhood
          </Link>
        </p>
      </section>
      <EnquireSection source="insights" compact ground="night" />
      <SiteFooter />
    </main>
  );
}
