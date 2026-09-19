import type { Metadata } from 'next';
import { copy, copyLines, getDevelopment, getMediaSlotsSafe, getPagesSafe } from '../../lib/api';
import { pageMetadata } from '../../lib/page-metadata';
import { PageHeader, TitleLines } from '../../components/layout/PageHero';
import { LocationExperience } from '../../components/home/LocationExperience';
import { EnquireSection } from '../../components/home/EnquireSection';
import { SiteFooter } from '../../components/layout/SiteFooter';

export const revalidate = 3600;

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata('/location', { title: 'Location' });
}

export default async function LocationPage() {
  const [dev, pages, slots] = await Promise.all([getDevelopment().catch(() => null), getPagesSafe(), getMediaSlotsSafe()]);
  const showNearbyPlaces = pages.locationSection?.showNearbyPlaces === true || copy(pages, 'locationSection', 'showNearbyPlaces') === 'true';
  return (
    <main id="main">
      <PageHeader
        bold
        kicker={copy(pages, 'location', 'heroKicker')}
        title={<TitleLines lines={copyLines(pages, 'location', 'heroTitle')} />}
        lede={copy(pages, 'location', 'heroLede')}
/>
      {dev && showNearbyPlaces && (
        <LocationExperience
          id="neighbourhood"
          landmarks={dev.landmarks}
          latitude={dev.latitude}
          longitude={dev.longitude}
          kicker={copy(pages, 'locationSection', 'kicker')}
          title={copy(pages, 'locationSection', 'title')}
          lede={copy(pages, 'locationSection', 'lede')}
          note={copy(pages, 'locationSection', 'note')}
          ground="quiet"
        />
      )}
      <EnquireSection source="location" heading={['Come and', 'see the site.']} compact ground="night" />
      <SiteFooter />
    </main>
  );
}
