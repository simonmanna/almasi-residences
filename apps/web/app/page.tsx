import type { Metadata } from 'next';
import { formatQuarter } from '@avida/types';
import { getDevelopment, type DevelopmentDto } from '../lib/api';
import { developmentJsonLd } from '../lib/seo';
import { HeroExperience } from '../components/home/HeroExperience';
import { Introduction } from '../components/home/Introduction';
import { ExploreAlmasi } from '../components/explore/ExploreAlmasi';
import { ResidencesPreview } from '../components/home/ResidencesPreview';
import { ExperienceStory } from '../components/home/ExperienceStory';
import { AmenityExperience } from '../components/home/AmenityExperience';
import { LocationExperience } from '../components/home/LocationExperience';
import { PenthouseFeature } from '../components/home/PenthouseFeature';
import { PaymentTimeline } from '../components/home/PaymentTimeline';
import { FilmTeaser } from '../components/home/FilmTeaser';
import { GalleryStrip } from '../components/home/GalleryStrip';
import { EnquireSection } from '../components/home/EnquireSection';
import { SiteFooter } from '../components/layout/SiteFooter';

/** §11 — ISR; the inventory inside refreshes on its own every minute (InventoryProvider). */
export const revalidate = 300;

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

export default async function HomePage() {
  let dev: DevelopmentDto | null = null;
  try {
    dev = await getDevelopment();
  } catch (e) {
    if (process.env.NODE_ENV === 'production') throw e;
  }
  const handover = dev?.handoverDate ? formatQuarter(dev.handoverDate) : 'Q2 2028';

  return (
    <main id="main">
      {dev && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(developmentJsonLd(dev)) }}
        />
      )}
      <HeroExperience />
      <Introduction handover={handover} />
      <ExploreAlmasi />
      <ResidencesPreview />
      <ExperienceStory />
      <AmenityExperience amenities={dev?.amenities ?? []} />
      {dev && (
        <LocationExperience landmarks={dev.landmarks} latitude={dev.latitude} longitude={dev.longitude} />
      )}
      <PenthouseFeature />
      <PaymentTimeline milestones={dev?.milestones ?? []} handover={handover} />
      <FilmTeaser />
      <GalleryStrip />
      <EnquireSection />
      <SiteFooter />
    </main>
  );
}
