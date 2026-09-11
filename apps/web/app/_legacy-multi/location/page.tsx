import type { Metadata } from 'next';
import { getDevelopment } from '../../../lib/api';
import { Location, SiteFooter } from '../../../components/sections/Content';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Location',
  description: 'Where the building sits, and what is within reach of it.',
  alternates: { canonical: '/location' },
};

export default async function LocationPage() {
  const dev = await getDevelopment();
  return (
    <main className="page">
      <h1 className="display">Location</h1>
      <Location dev={dev} />
      <SiteFooter dev={dev} />
    </main>
  );
}
