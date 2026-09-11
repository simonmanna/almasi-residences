import type { Metadata } from 'next';
import { getDevelopment, getInventory, getProgress } from '../../../lib/api';
import { Availability } from '../../../components/sections/Availability';
import {
  Amenities,
  Developer,
  Faq,
  Hero,
  Location,
  Narrative,
  PaymentPlan,
  Residences,
  SiteFooter,
} from '../../../components/sections/Content';
import { EnquiryCta } from '../../../components/sections/EnquiryCta';
import { Concierge } from '../../../components/Concierge';
import { Gallery } from '../../../components/Gallery';
import { ProgressTimeline } from '../../../components/sections/ProgressTimeline';
import { SectionRail } from '../../../components/SectionRail';
import { developmentJsonLd } from '../../../lib/seo';

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const dev = await getDevelopment();
  return {
    title: dev.seo?.title ?? `${dev.name} — ${dev.tagline ?? dev.city}`,
    description: dev.seo?.description ?? dev.tagline ?? '',
    // §6.1 — multi-page mode is the SEO default, so the single-page rendering
    // points at the same canonical rather than competing with it.
    alternates: { canonical: '/' },
  };
}

/**
 * §6.1 — single-page mode. Every section, in order, over the same components
 * multi-page mode uses. The URL stays "/" — proxy.ts rewrites here.
 */
export default async function SinglePage() {
  const [dev, inventory, progress] = await Promise.all([
    getDevelopment(),
    getInventory(),
    getProgress(),
  ]);
  const hero = dev.mediaSets.find((s) => s.key === 'hero-exterior');
  const aerial = dev.mediaSets.find((s) => s.key === 'aerial-context');

  return (
    <>
      {/* §6.1 — single-page mode gets the sticky progress rail; multi-page gets
          breadcrumbs and per-page metadata instead. */}
      <SectionRail />
      <main className="page">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(developmentJsonLd(dev)) }}
        />
        <Hero dev={dev} hero={hero} />
        <Narrative dev={dev} aerial={aerial} />
        <Residences dev={dev} mode="single" />
        <Availability inventory={inventory} />
        <Concierge developmentSlug={dev.slug} />
        <Amenities dev={dev} />
        <Location dev={dev} />
        <section id="gallery" className="section">
          <h2 className="head">Gallery</h2>
          <Gallery sets={dev.mediaSets} />
        </section>
        <PaymentPlan dev={dev} />
        <ProgressTimeline updates={progress} />
        <Developer />
        <Faq dev={dev} />
        <EnquiryCta />
        <SiteFooter dev={dev} />
      </main>
    </>
  );
}
