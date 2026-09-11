import type { Metadata } from 'next';
import { getDevelopment } from '../../../lib/api';
import { EnquiryForm } from '../../../components/EnquiryForm';
import { SiteFooter } from '../../../components/sections/Content';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Enquire',
  description: 'Ask about a unit, or arrange a viewing with the sales team.',
  alternates: { canonical: '/enquire' },
};

export default async function EnquirePage() {
  const dev = await getDevelopment();
  return (
    <main className="page">
      <h1 className="display">Request a viewing</h1>
      <p className="lead">
        Tell us which apartments interest you and someone from the sales team will be in touch
        within one working day.
      </p>
      <EnquiryForm source="enquire-page" />
      <SiteFooter dev={dev} />
    </main>
  );
}
