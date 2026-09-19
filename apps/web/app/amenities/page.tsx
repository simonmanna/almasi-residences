import type { Metadata } from 'next';
import { copy, copyLines, getAmenities, getDevelopment, getMediaSlotsSafe, getPagesSafe } from '../../lib/api';
import { pageMetadata } from '../../lib/page-metadata';
import { PageHeader, TitleLines } from '../../components/layout/PageHero';
import { AmenityExperience } from '../../components/home/AmenityExperience';
import { EnquireSection } from '../../components/home/EnquireSection';
import { SiteFooter } from '../../components/layout/SiteFooter';

export const revalidate = 3600;

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata('/amenities', { title: 'Amenities' });
}

/** The amenities are managed in the admin (§19); the heading is CMS copy, the header image a placement. */
export default async function AmenitiesPage() {
  const [pages, amenities, dev, slots] = await Promise.all([getPagesSafe(), getAmenities().catch(() => []), getDevelopment().catch(() => null), getMediaSlotsSafe()]);
  return (
    <main id="main">
      <PageHeader
        bold
        kicker={copy(pages, 'amenities', 'heroKicker')}
        title={<TitleLines lines={copyLines(pages, 'amenities', 'heroTitle')} />}
        lede={copy(pages, 'amenities', 'heroLede')}
/>
      <AmenityExperience id="amenity-list" amenities={amenities.length ? amenities : (dev?.amenities ?? [])} kicker="" lines={[]} lead="" ground="quiet" />
      <EnquireSection source="amenities" heading={['See it', 'for yourself.']} compact ground="night" />
      <SiteFooter />
    </main>
  );
}
