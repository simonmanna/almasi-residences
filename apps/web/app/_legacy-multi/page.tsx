import type { Metadata } from 'next';
import { getDevelopment } from '../../lib/api';
import { Developer, Faq, Hero, Narrative, PaymentPlan, SiteFooter } from '../../components/sections/Content';
import { EnquiryCta } from '../../components/sections/EnquiryCta';
import { developmentJsonLd } from '../../lib/seo';

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const dev = await getDevelopment();
  return {
    title: dev.seo?.title ?? `${dev.name} — ${dev.tagline ?? dev.city}`,
    description: dev.seo?.description ?? dev.tagline ?? '',
    alternates: { canonical: '/' },
  };
}

/**
 * §6.1 — multi-page mode's home: hero, the idea, the plan and a way in. The
 * full inventory lives on /availability, which is what ranks.
 */
export default async function MultiHome() {
  const dev = await getDevelopment();
  const hero = dev.mediaSets.find((s) => s.key === 'hero-exterior');
  const aerial = dev.mediaSets.find((s) => s.key === 'aerial-context');

  return (
    <main className="page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(developmentJsonLd(dev)) }}
      />
      <Hero dev={dev} hero={hero} />
      <Narrative dev={dev} aerial={aerial} />
      <PaymentPlan dev={dev} />
      <Developer />
      <Faq dev={dev} />
      <EnquiryCta />
      <SiteFooter dev={dev} />
    </main>
  );
}
