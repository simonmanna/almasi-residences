import type { Metadata } from 'next';
import { getDevelopment, getInventory } from '../../../lib/api';
import { Availability } from '../../../components/sections/Availability';
import { Concierge } from '../../../components/Concierge';
import { PaymentPlan, SiteFooter } from '../../../components/sections/Content';

/** §11 — ISR; the API's revalidation webhook rebuilds this on any status change. */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Availability',
  description: 'Live availability of 28 apartments in Kimihurura, Kigali. Prices, floor plans and payment schedules updated daily.',
  alternates: { canonical: '/availability' },
};

export default async function AvailabilityPage() {
  const [dev, inventory] = await Promise.all([getDevelopment(), getInventory()]);
  return (
    <main className="page">
      <h1 className="display">Availability</h1>
      <Availability inventory={inventory} />
      <Concierge developmentSlug={dev.slug} />
      <PaymentPlan dev={dev} />
      <SiteFooter dev={dev} />
    </main>
  );
}
