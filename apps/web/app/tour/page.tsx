import type { Metadata } from 'next';
import { getWalkthrough } from '../../lib/api';
import { pageMetadata } from '../../lib/page-metadata';
import { TourExperience } from '../../components/tour/TourExperience';
import { assertPageVisible } from '../../lib/page-visibility';

export const revalidate = 3600;

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata('/tour', { title: 'The 3D tour' });
}

/** The stations are a walkthrough edited in the admin (Website → Tours, roadmap item 22). */
export default async function TourPage() {
  await assertPageVisible('tour');

  const tour = await getWalkthrough('building').catch(() => null);
  return (
    <main id="main" data-nav-ground="night">
      <TourExperience stations={tour?.stations ?? []} title={tour?.name ?? ''} otherTour={{ href: '/tour/penthouse', label: 'Penthouse tour' }} />
    </main>
  );
}
