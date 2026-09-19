import type { Metadata } from 'next';
import { formatQuarter } from '@avida/types';
import {
  copy,
  copyLines,
  getAmenities,
  getDevelopment,
  getFeatured,
  getPagesSafe,
  getProgress,
  getTypologyCards,
  getWalkthrough,
  type DevelopmentDto,
} from '../lib/api';
import { pageMetadata } from '../lib/page-metadata';
import { developmentJsonLd } from '../lib/seo';
import { HeroExperience } from '../components/home/HeroExperience';
import { Introduction } from '../components/home/Introduction';
import { ExploreAlmasi } from '../components/explore/ExploreAlmasi';
import { ResidencesPreview } from '../components/home/ResidencesPreview';
import { FeaturedResidences } from '../components/home/FeaturedResidences';
import { ExperienceStory } from '../components/home/ExperienceStory';
import { AmenityExperience } from '../components/home/AmenityExperience';
import { LocationExperience } from '../components/home/LocationExperience';
import { PaymentTimeline } from '../components/home/PaymentTimeline';
import { ProgressPreview } from '../components/home/ProgressPreview';
import { FilmTeaser } from '../components/home/FilmTeaser';
import { EnquireSection } from '../components/home/EnquireSection';
import { SiteFooter } from '../components/layout/SiteFooter';

/** §11 — ISR; every admin save refreshes it by cache tag (§3.1), and the inventory inside refreshes every minute. */
export const revalidate = 3600;

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata('/');
}

/**
 * Every word, picture and chapter on this page comes from the admin: copy from
 * Website → Homepage, pictures from placements, the story from the
 * "experience" walkthrough, residences and amenities from their records.
 */
export default async function HomePage() {
  let dev: DevelopmentDto | null = null;
  try {
    dev = await getDevelopment();
  } catch (e) {
    if (process.env.NODE_ENV === 'production') throw e;
  }
  const [pages, amenities, featured, cards, story, progress] = await Promise.all([
    getPagesSafe(),
    getAmenities().catch(() => []),
    getFeatured().catch(() => []),
    getTypologyCards().catch(() => []),
    getWalkthrough('experience').catch(() => null),
    getProgress().catch(() => []),
  ]);
  const handover = dev?.handoverDate ? formatQuarter(dev.handoverDate) : null;
  const home = (key: string) => copy(pages, 'home', key);
  // An unfilled CMS field must never ship a hero with no way in.
  const primaryCta = {
    label: home('ctaPrimaryLabel') || 'Explore residences',
    href: home('ctaPrimaryHref') || '/residences',
  };
  const secondaryCta = {
    label: home('ctaSecondaryLabel') || 'Book a private viewing',
    href: home('ctaSecondaryHref') || '/enquire#viewing',
  };
  const showNearbyPlaces = pages.locationSection?.showNearbyPlaces === true || copy(pages, 'locationSection', 'showNearbyPlaces') === 'true';

  return (
    <main id="main">
      {dev && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(developmentJsonLd(dev)) }} />}
      <HeroExperience
        kicker={home('heroKicker')}
        title={home('heroTitle') || dev?.name || ''}
        subtitle={home('heroSubtitle')}
        place={dev ? `${dev.city}, ${dev.country === 'RW' ? 'Rwanda' : dev.country}` : ''}
        primary={primaryCta}
        secondary={secondaryCta}
      />
      <Introduction handover={handover} title={home('introTitle')} body={home('introBody')} kicker={home('heroKicker')} developmentName={dev?.name ?? ''} buildingConfig={dev?.buildingConfig} primary={primaryCta} secondary={secondaryCta} />
      <ExploreAlmasi />
      <ResidencesPreview cards={cards} kicker={home('residencesKicker')} title={home('residencesTitle')} />
      <FeaturedResidences items={featured} />
      <ExperienceStory stations={story?.stations ?? []} title={home('storyTitle')} />
      <AmenityExperience
        amenities={amenities.length ? amenities : (dev?.amenities ?? [])}
        kicker={home('amenitiesKicker')}
        lines={copyLines(pages, 'home', 'amenitiesTitle')}
        lead={home('amenitiesLede')}
        ground="quiet"
      />
      {dev && showNearbyPlaces && (
        <LocationExperience
          landmarks={dev.landmarks}
          latitude={dev.latitude}
          longitude={dev.longitude}
          kicker={copy(pages, 'locationSection', 'kicker')}
          title={copy(pages, 'locationSection', 'title')}
          lede={copy(pages, 'locationSection', 'lede')}
          note={copy(pages, 'locationSection', 'note')}
        />
      )}
      <PaymentTimeline milestones={dev?.milestones ?? []} handover={handover} />
      <ProgressPreview updates={progress} kicker={home('progressKicker')} title={copyLines(pages, 'home', 'progressTitle')} />
      <FilmTeaser kicker={home('filmKicker')} title={home('filmTitle')} cta={home('filmCta')} />
      <EnquireSection compact ground="quiet" />
      <SiteFooter />
    </main>
  );
}
