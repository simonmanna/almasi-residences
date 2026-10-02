import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocationPages } from '../../../lib/api';
import { pageMetadata } from '../../../lib/page-metadata';
import { PageHeader, TitleLines } from '../../../components/layout/PageHero';
import { Breadcrumbs } from '../../../components/layout/Breadcrumbs';
import { SceneImage } from '../../../components/ui/SceneImage';
import { SiteFooter } from '../../../components/layout/SiteFooter';
import styles from './locations.module.css';

export const revalidate = 3600;

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata('/locations');
}

/**
 * §SEO — the neighbourhoods, one page each. They exist because "apartments in
 * Kimihurura" is how people actually search, and because a buyer moving to the
 * city needs to know what is around the building before they care which floor.
 */
export default async function LocationsPage() {
  const pages = await getLocationPages().catch(() => []);
  return (
    <main id="main">
      <PageHeader
        kicker="Locations"
        title={<TitleLines lines={['The city', 'around the door.']} />}
        lede="Kigali, neighbourhood by neighbourhood: what is within walking distance, what is a short drive, and how each area feels."
      />
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Locations', path: '/locations' }]} />
      <section className={`container ground-band ${styles.section}`} data-ground="quiet" aria-label="Neighbourhoods">
        {pages.length === 0 ? (
          <p className="lead">
            The neighbourhood guides are being written. In the meantime, the{' '}
            <Link href="/location" className="link-line">
              location of the building
            </Link>{' '}
            shows what is nearby.
          </p>
        ) : (
          <ul className={styles.grid}>
            {pages.map((p) => (
              <li key={p.id} className={styles.item} data-reveal>
                <Link href={`/locations/${p.slug}`} className={styles.card} data-cursor="Explore">
                  <div className={styles.media}>
                    <SceneImage media={p.hero} sizes="(max-width: 900px) 100vw, 50vw" label={p.name} />
                  </div>
                  <div className={styles.text}>
                    {p.kicker && <p className="eyebrow">{p.kicker}</p>}
                    <h2 className="h3">{p.name}</h2>
                    {p.lede && <p className="body muted">{p.lede}</p>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}
