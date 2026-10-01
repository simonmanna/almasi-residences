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
import { isVisible } from '../lib/page-visibility';
import { priceDisplay } from '../lib/price-display';
import { developmentJsonLd } from '../lib/seo';
import { titleCaseHeading } from '../lib/text';
import { HeroExperience } from '../components/home/HeroExperience';
import { Introduction } from '../components/home/Introduction';
import { MobileQuickNav } from '../components/home/MobileQuickNav';
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
 * Website → Homepage (and the Experience and Film section pages), pictures
 * from placements, the story from the "experience" walkthrough, residences and amenities from their records.
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
  const homeHeading = (key: string) => titleCaseHeading(home(key));
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
  // Website → Selected Residence. Absent (never saved) means shown, as it always was.
  const showFeatured = pages.featuredSection?.showFeaturedResidences !== false && copy(pages, 'featuredSection', 'showFeaturedResidences') !== 'false';
  // Website → Experience and Website → Film. Absent (never saved) means shown.
  const showExperience = pages.experienceSection?.showExperienceSection !== false;
  const showFilm = pages.filmSection?.showFilmSection !== false;
  // Website → Enquiry.
  const showEnquiry = pages.enquirySection?.showEnquirySection !== false;
  // Website → Prices: each "from" price is calculated unless overridden there.
  const prices = priceDisplay(pages);
  const section = (page: string, key: string) => titleCaseHeading(copy(pages, page, key));

  return (
    <main id="main" className="home">
      {dev && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(developmentJsonLd(dev)) }} />}
      <HeroExperience
        kicker={home('heroKicker')}
        title={homeHeading('heroTitle') || dev?.name || ''}
        subtitle={home('heroSubtitle')}
        tagline={home('heroTagline') || 'A rare place to call home.'}
        place={dev ? `${dev.city}, ${dev.country === 'RW' ? 'Rwanda' : dev.country}` : ''}
        primary={primaryCta}
        handover={handover}
        priceText={prices.hero}
      />
      {isVisible(pages, 'residences') && <MobileQuickNav show3dTour={isVisible(pages, 'design3d')} showLocation={isVisible(pages, 'location')} />}
      <Introduction handover={handover} title={homeHeading('introTitle')} body={home('introBody')} kicker={titleCaseHeading(home('heroKicker'))} developmentName={dev?.name ?? ''} buildingConfig={dev?.buildingConfig} primary={primaryCta} secondary={secondaryCta} />
      <ExploreAlmasi fromText={prices.building} />
      <ResidencesPreview cards={cards} kicker={homeHeading('residencesKicker')} title={homeHeading('residencesTitle')} priceText={prices.residences} />
      {showFeatured && <FeaturedResidences items={featured} />}
      {showExperience && <ExperienceStory stations={story?.stations ?? []} title={section('experienceSection', 'title')} />}
      <AmenityExperience
        amenities={amenities.length ? amenities : (dev?.amenities ?? [])}
        kicker={homeHeading('amenitiesKicker')}
        lines={copyLines(pages, 'home', 'amenitiesTitle').map(titleCaseHeading)}
        lead={home('amenitiesLede')}
        ground="quiet"
      />
      {dev && showNearbyPlaces && (
        <LocationExperience
          landmarks={dev.landmarks}
          latitude={dev.latitude}
          longitude={dev.longitude}
          kicker={titleCaseHeading(copy(pages, 'locationSection', 'kicker'))}
          title={titleCaseHeading(copy(pages, 'locationSection', 'title'))}
          lede={copy(pages, 'locationSection', 'lede')}
          note={copy(pages, 'locationSection', 'note')}
          ground="night"
          limit={6}
        />
      )}
      <PaymentTimeline milestones={dev?.milestones ?? []} handover={handover} ground="quiet" showPrices={prices.payment.show} prices={prices.payment.prices} />
      <ProgressPreview updates={progress} kicker={homeHeading('progressKicker')} title={copyLines(pages, 'home', 'progressTitle').map(titleCaseHeading)} />
      {showFilm && <FilmTeaser kicker={section('filmSection', 'kicker')} title={section('filmSection', 'title')} cta={copy(pages, 'filmSection', 'cta')} />}
      {showEnquiry && <EnquireSection compact ground="quiet" />}
      <SiteFooter />
    </main>
  );
}
