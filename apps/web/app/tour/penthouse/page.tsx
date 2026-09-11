import type { Metadata } from 'next';
import { PENTHOUSE_TOUR } from '../../../lib/tour';
import { TourExperience } from '../../../components/tour/TourExperience';

export const metadata: Metadata = {
  title: 'The penthouse tour',
  description:
    'Walk through a penthouse at Almasi Residences, Kigali: the living room, kitchen, master suite, en-suite and the private roof terrace with its pool and view over the city.',
  alternates: { canonical: '/tour/penthouse' },
};

export default function PenthouseTourPage() {
  return (
    <main id="main" data-nav-ground="night">
      <TourExperience
        stations={PENTHOUSE_TOUR}
        title="The penthouse tour"
        otherTour={{ href: '/tour', label: 'Building tour' }}
      />
    </main>
  );
}
