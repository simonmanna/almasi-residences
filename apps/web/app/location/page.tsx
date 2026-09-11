import type { Metadata } from 'next';
import { getDevelopment } from '../../lib/api';
import { PageHero } from '../../components/layout/PageHero';
import { LocationExperience } from '../../components/home/LocationExperience';
import { EnquireSection } from '../../components/home/EnquireSection';
import { SiteFooter } from '../../components/layout/SiteFooter';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Location — Kimihurura, Kigali',
  description:
    'Almasi Residences stands in Kimihurura, Kigali, minutes from the Kigali Convention Centre, King Faisal Hospital, the city centre and the airport road.',
  alternates: { canonical: '/location' },
};

export default async function LocationPage() {
  const dev = await getDevelopment().catch(() => null);
  return (
    <main id="main">
      <PageHero
        sceneId="aerial"
        kicker="Location"
        title={
          <>
            Kimihurura,
            <br />
            <span className="italic">Kigali</span>
          </>
        }
        lede="A green ridge east of the city centre: embassies and restaurants on one side, the golf course and the airport road on the other."
      />
      {dev && (
        <LocationExperience
          id="neighbourhood"
          landmarks={dev.landmarks}
          latitude={dev.latitude}
          longitude={dev.longitude}
        />
      )}
      <EnquireSection source="location" heading={['Come and', 'see the site.']} />
      <SiteFooter />
    </main>
  );
}
