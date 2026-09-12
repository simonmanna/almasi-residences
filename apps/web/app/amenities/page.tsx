import type { Metadata } from 'next';
import { copy, getAmenities, getDevelopment, getPagesSafe } from '../../lib/api';
import { twoLines } from '../../lib/text';
import { PageHero } from '../../components/layout/PageHero';
import { AmenityExperience } from '../../components/home/AmenityExperience';
import { EnquireSection } from '../../components/home/EnquireSection';
import { SiteFooter } from '../../components/layout/SiteFooter';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Amenities — pool, gym, spa, restaurant and co-working',
  description:
    'The amenities at Almasi Residences, Kimihurura: a 15-metre pool, gym, sauna and massage room, a residents’ restaurant, co-working space, staffed reception and basement parking.',
  alternates: { canonical: '/amenities' },
};

/** The amenities themselves are managed in the admin (§19); this page's heading is CMS copy (§21). */
export default async function AmenitiesPage() {
  const [pages, amenities, dev] = await Promise.all([getPagesSafe(), getAmenities().catch(() => []), getDevelopment().catch(() => null)]);
  const [a, b] = twoLines(copy(pages, 'amenities', 'heroTitle', 'The art of living'));
  return (
    <main id="main">
      <PageHero
        sceneId="pool"
        kicker={copy(pages, 'amenities', 'heroKicker', 'Amenities')}
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
        lede={copy(pages, 'amenities', 'heroLede', 'A pool, a gym, a sauna and a restaurant inside the gate — so the best part of the day never needs the car.')}
      />
      <AmenityExperience id="amenity-list" amenities={amenities.length ? amenities : (dev?.amenities ?? [])} />
      <EnquireSection source="amenities" heading={['See it', 'for yourself.']} />
      <SiteFooter />
    </main>
  );
}
