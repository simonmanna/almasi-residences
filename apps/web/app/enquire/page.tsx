import type { Metadata } from 'next';
import { PageHeader } from '../../components/layout/PageHero';
import { EnquireSection } from '../../components/home/EnquireSection';
import { SiteFooter } from '../../components/layout/SiteFooter';

export const metadata: Metadata = {
  title: 'Enquire or book a viewing',
  description:
    'Contact the Almasi Residences sales team in Kigali: ask about a residence, arrange a private viewing or discuss a reservation.',
  alternates: { canonical: '/enquire' },
};

export default function EnquirePage() {
  return (
    <main id="main">
      <PageHeader
        kicker="Contact"
        title={
          <>
            Enquire about
            <br />
            <span className="italic">Almasi</span>
          </>
        }
        lede="Ask about a residence, arrange a viewing or discuss a reservation. The sales team replies within one working day."
      />
      <EnquireSection id="enquire-form" source="enquire-page" heading={['Arrange a', 'private viewing.']} />
      <SiteFooter />
    </main>
  );
}
