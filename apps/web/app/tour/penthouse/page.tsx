import type { Metadata } from 'next';
import { getWalkthrough } from '../../../lib/api';
import { pageMetadata } from '../../../lib/page-metadata';
import { TourExperience } from '../../../components/tour/TourExperience';

export const revalidate = 3600;

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata('/tour/penthouse', { title: 'The penthouse tour' });
}

/** The stations are a walkthrough edited in the admin (Website → Tours, roadmap item 22). */
export default async function PenthouseTourPage() {
  const tour = await getWalkthrough('penthouse').catch(() => null);
  return (
    <main id="main" data-nav-ground="night">
      <TourExperience stations={tour?.stations ?? []} title={tour?.name ?? ''} otherTour={{ href: '/tour', label: 'Building tour' }} />
    </main>
  );
}
