import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDistance } from '@avida/types';
import { getDevelopment, getFeatured, getLocationPage, getLocationPages } from '../../../../lib/api';
import { entityMetadata } from '../../../../lib/page-metadata';
import { plainText, renderMarkdown } from '../../../../lib/markdown';
import { placeJsonLd } from '../../../../lib/seo';
import { Breadcrumbs } from '../../../../components/layout/Breadcrumbs';
import { LocationExperience } from '../../../../components/home/LocationExperience';
import { SceneImage } from '../../../../components/ui/SceneImage';
import { EnquireSection } from '../../../../components/home/EnquireSection';
import { SiteFooter } from '../../../../components/layout/SiteFooter';
import styles from '../locations.module.css';

export const revalidate = 3600;

export async function generateStaticParams() {
  try {
    return (await getLocationPages()).map((p) => ({ slug: p.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await getLocationPage(slug).catch(() => null);
  if (!page) notFound();
  const where = [page.locality, page.region].filter(Boolean).join(', ');
  return entityMetadata({
    path: `/locations/${page.slug}`,
    derivedTitle: page.title ?? `${page.name}${where ? `, ${where}` : ''}`,
    derivedDescription: page.lede ?? plainText(page.body, 170),
    image: page.hero,
    seo: page.seo,
  });
}

/**
 * §SEO — one neighbourhood, written by the admin, with the places actually
 * listed on the page and nothing more in its structured data.
 */
export default async function LocationDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [page, dev, featured] = await Promise.all([
    getLocationPage(slug).catch(() => null),
    getDevelopment().catch(() => null),
    getFeatured().catch(() => []),
  ]);
  if (!page) notFound();

  const landmarks = page.landmarks.map((l) => ({ ...l, visible: true }));

  return (
    <main id="main">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(placeJsonLd(page)) }} />
      <header className={`container ground-band ${styles.head}`} data-ground="night" data-nav-over>
        {page.kicker && <p className="mark">{page.kicker}</p>}
        <h1 id="page-title" className="display">
          {page.title ?? page.name}
        </h1>
        {page.lede && <p className="lead">{page.lede}</p>}
      </header>
      <Breadcrumbs
        items={[
          { name: 'Home', path: '/' },
          { name: 'Locations', path: '/locations' },
          { name: page.name, path: `/locations/${page.slug}` },
        ]}
      />
      {page.hero && (
        <div className={`container ${styles.heroMedia}`}>
          <SceneImage media={page.hero} priority sizes="100vw" label={page.name} />
        </div>
      )}
      {page.body && <article className={`container ${styles.prose}`}>{renderMarkdown(page.body)}</article>}

      {landmarks.length > 0 && page.latitude !== null && page.longitude !== null && (
        <LocationExperience
          id="nearby"
          landmarks={landmarks}
          latitude={page.latitude}
          longitude={page.longitude}
          kicker="Nearby"
          title={`Around ${page.name}`}
          lede=""
          note="Straight-line distances from the site. Drive times are estimates at an average city speed."
          ground="quiet"
        />
      )}

      {landmarks.length > 0 && (
        <section className={`container ground-band ${styles.section}`} data-ground="stone" aria-labelledby="places-title">
          <h2 id="places-title" className="title-xs">
            What is within reach
          </h2>
          <ul className={styles.places}>
            {landmarks.slice(0, 12).map((l) => (
              <li key={l.id} className={styles.place}>
                <span>{l.name}</span>
                <span className="tabular muted">
                  {l.distanceM !== null ? formatDistance(l.distanceM) : '—'}
                  {l.driveMinutes ? ` · ${l.driveMinutes} min by car` : ''}
                  {l.walkMinutes ? ` · ${l.walkMinutes} min on foot` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* §SEO — a location page that links nowhere sells nothing: the homes
          themselves are one click away, and so are the other neighbourhoods. */}
      {featured.length > 0 && (
        <section className={`container ground-band ${styles.section}`} data-ground="quiet" aria-labelledby="homes-title">
          <h2 id="homes-title" className="title-xs">
            Residences {dev?.name ? `at ${dev.name}` : 'here'}
          </h2>
          <ul className={styles.grid}>
            {featured.slice(0, 3).map((r) => (
              <li key={r.id} className={styles.item}>
                <Link href={`/residences/${r.slug}`} className={styles.card} data-cursor="View">
                  <div className={styles.media}>
                    <SceneImage media={r.cover} sizes="(max-width: 900px) 100vw, 33vw" label={`Residence ${r.label}`} />
                  </div>
                  <div className={styles.text}>
                    <p className="eyebrow">{r.type.name}</p>
                    <h3 className="h3">Residence {r.label}</h3>
                    <p className="body muted">
                      {r.bedrooms} bedrooms · {r.areaSqm} m²
                    </p>
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
              Other neighbourhoods
            </Link>
            <Link href="/insights" className="link-line">
              Read the guides
            </Link>
          </p>
        </section>
      )}
      <EnquireSection source="locations" compact ground="night" />
      <SiteFooter />
    </main>
  );
}
