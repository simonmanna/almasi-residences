import type { Metadata } from 'next';
import { formatQuarter } from '@avida/types';
import { copy, getAmenities, getDevelopment, getFeatured, getGalleries, getPagesSafe, type DevelopmentDto } from '../lib/api';
import { developmentJsonLd } from '../lib/seo';
import { HeroExperience } from '../components/home/HeroExperience';
import { Introduction } from '../components/home/Introduction';
import { ExploreAlmasi } from '../components/explore/ExploreAlmasi';
import { ResidencesPreview } from '../components/home/ResidencesPreview';
import { FeaturedResidences } from '../components/home/FeaturedResidences';
import { ExperienceStory } from '../components/home/ExperienceStory';
import { AmenityExperience } from '../components/home/AmenityExperience';
import { LocationExperience } from '../components/home/LocationExperience';
import { PenthouseFeature } from '../components/home/PenthouseFeature';
import { PaymentTimeline } from '../components/home/PaymentTimeline';
import { FilmTeaser } from '../components/home/FilmTeaser';
import { GalleryStrip } from '../components/home/GalleryStrip';
import { EnquireSection } from '../components/home/EnquireSection';
import { SiteFooter } from '../components/layout/SiteFooter';

/** §11 — ISR; admin saves revalidate this page at once (§37), and the inventory inside refreshes every minute. */
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
  const [pages, amenities, galleries, featured] = await Promise.all([
    getPagesSafe(),
    getAmenities().catch(() => []),
    getGalleries().catch(() => []),
    getFeatured().catch(() => []),
  ]);
  const handover = dev?.handoverDate ? formatQuarter(dev.handoverDate) : 'Q2 2028';
  const home = (key: string, fallback: string) => copy(pages, 'home', key, fallback);
  const strip = [...new Map(galleries.flatMap((g) => g.items).filter((m) => m.kind === 'IMAGE').map((m) => [m.id, m])).values()].slice(0, 12);

  return (
    <main id="main">
      {dev && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(developmentJsonLd(dev)) }}
        />
      )}
      <HeroExperience
        kicker={home('heroKicker', 'Kimihurura · Kigali')}
        title={home('heroTitle', 'Almasi Residences')}
        subtitle={home('heroSubtitle', 'Contemporary residences in the heart of Kimihurura.')}
        primary={{ label: home('ctaPrimaryLabel', 'Explore residences'), href: home('ctaPrimaryHref', '/residences') }}
        secondary={{ label: home('ctaSecondaryLabel', 'Take the 3D tour'), href: home('ctaSecondaryHref', '/tour') }}
      />
      <Introduction
        handover={handover}
        title={home('introTitle', 'One distinct address.')}
        body={home('introBody', '') || undefined}
        buildingConfig={dev?.buildingConfig}
      />
      <ExploreAlmasi />
      <ResidencesPreview />
      <FeaturedResidences items={featured} />
      <ExperienceStory />
      <AmenityExperience amenities={amenities.length ? amenities : (dev?.amenities ?? [])} />
      {dev && (
        <LocationExperience landmarks={dev.landmarks} latitude={dev.latitude} longitude={dev.longitude} />
      )}
      <PenthouseFeature />
      <PaymentTimeline milestones={dev?.milestones ?? []} handover={handover} />
      <FilmTeaser />
      <GalleryStrip items={strip} />
      <EnquireSection />
      <SiteFooter />
    </main>
  );
}
