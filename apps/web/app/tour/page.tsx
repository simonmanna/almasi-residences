import type { Metadata } from 'next';
import { BUILDING_TOUR } from '../../lib/tour';
import { TourExperience } from '../../components/tour/TourExperience';

export const metadata: Metadata = {
  title: 'The 3D tour — walk through Almasi Residences',
  description:
    'A virtual tour of Almasi Residences in Kimihurura, Kigali: the entrance, the reception, the pool, the restaurant, the gym and wellness suite, co-working, and a residence from living room to balcony.',
  alternates: { canonical: '/tour' },
};

export default function TourPage() {
  return (
    <main id="main" data-nav-ground="night">
      <TourExperience
        stations={BUILDING_TOUR}
        title="The Almasi Residences tour"
        otherTour={{ href: '/tour/penthouse', label: 'Penthouse tour' }}
      />
    </main>
  );
}
