import type { Metadata } from 'next';
import { getDevelopment } from '../../lib/api';
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

export default async function AmenitiesPage() {
  const dev = await getDevelopment().catch(() => null);
  return (
    <main id="main">
      <PageHero
        sceneId="pool"
        kicker="Amenities"
        title={
          <>
            The art
            <br />
            <span className="italic">of living</span>
          </>
        }
        lede="A pool, a gym, a sauna and a restaurant inside the gate — so the best part of the day never needs the car."
      />
      <AmenityExperience id="amenity-list" amenities={dev?.amenities ?? []} />
      <EnquireSection source="amenities" heading={['See it', 'for yourself.']} />
      <SiteFooter />
    </main>
  );
}
