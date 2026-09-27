import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatQuarter } from '@avida/types';
import { getInventory, getResidencePage, getSeoEntities, type PublicResidenceDto, type SeoEntityDto } from '../../../lib/api';
import { entityMetadata } from '../../../lib/page-metadata';
import {
  ORIENTATION_TEXT,
  STATUS_TEXT,
  TYPE_TEXT,
  residenceType,
  toResidences,
  type Residence,
} from '../../../lib/residences';
import { breadcrumbJsonLd, imageJsonLd, residenceJsonLd } from '../../../lib/seo';
import { Breadcrumbs } from '../../../components/layout/Breadcrumbs';
import { ResidenceDetail } from '../../../components/residence/ResidenceDetail';
import { SiteFooter } from '../../../components/layout/SiteFooter';
import { assertPageVisible } from '../../../lib/page-visibility';

/** Status changes reach this page within a minute; admin saves revalidate it at once (§37). */
export const revalidate = 60;

function toResidence(r: PublicResidenceDto): Residence {
  const type = residenceType(r.type.isPenthouse, r.bedrooms);
  const dbStatus = { available: 'AVAILABLE', reserved: 'RESERVED', booked: 'BOOKED', sold: 'SOLD', unavailable: 'UNAVAILABLE' } as const;
  return {
    id: r.id, code: r.code, label: r.label, slug: r.slug,
    floorLevel: r.floor.level, floorLabel: r.floor.label,
    type, typologySlug: r.type.slug, typologyName: r.type.name,
    bedrooms: r.bedrooms, bathrooms: r.bathrooms, areaSqm: r.areaSqm,
    priceMinor: r.priceMinor ?? r.listPriceMinor ?? 0, currency: r.currency,
    status: dbStatus[r.status], publicStatus: r.status,
    orientation: r.orientation, viewTags: r.viewTags,
    positionIndex: r.positionIndex, meshName: null, modelSlot: r.modelSlot ?? null,
    featured: r.featured,
  };
}

/** One static page per residence in the inventory — the API decides how many, never this file. */
export async function generateStaticParams() {
  try {
    return toResidences(await getInventory()).map((r) => ({ code: r.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const [data, overrides] = await Promise.all([
    getResidencePage(code).catch(() => undefined),
    // §SEO — what the admin wrote for this residence (SEO → Residences). It
    // wins over the sentence derived below, which is only ever a starting point.
    getSeoEntities('UNIT').catch((): Record<string, SeoEntityDto> => ({})),
  ]);
  // Thrown here, before the page streams, so the response is a real 404 rather than a soft one.
  if (!data) notFound();
  const pub = data.residence;
  const r = toResidence(pub);
  const where = `${data.property.city}, ${data.property.country === 'RW' ? 'Rwanda' : data.property.country}`;
  // "One bedroom" already says the number, so naming both read "1 bedroom one
  // bedroom" in every search result.
  const derivedTitle =
    r.type === 'penthouse'
      ? `${r.bedrooms} bedroom penthouse in ${where} | Residence ${r.label}`
      : `${r.bedrooms} bedroom apartment in ${where} | Residence ${r.label}`;
  const derivedDescription =
    pub?.shortDescription ??
    `${TYPE_TEXT[r.type]} residence ${r.label}: ${r.areaSqm} m² on ${r.floorLabel.toLowerCase()}, facing ${ORIENTATION_TEXT[r.orientation].toLowerCase()}. ${STATUS_TEXT[r.publicStatus]}.`;
  return entityMetadata({
    path: `/residences/${r.slug}`,
    derivedTitle,
    derivedDescription,
    image: pub?.images[0] ?? null,
    seo: overrides[pub.id] ?? null,
  });
}

export default async function ResidencePage({ params }: { params: Promise<{ code: string }> }) {
  await assertPageVisible('residences');

  const { code } = await params;
  const data = await getResidencePage(code).catch(() => null);
  if (!data) notFound();
  const residence = toResidence(data.residence);
  const dev = data.property;
  const handover = dev.handoverDate ? formatQuarter(dev.handoverDate) : null;
  const crumbs = [
    { name: dev.name, path: '/' },
    { name: 'Residences', path: '/residences' },
    { name: `Residence ${residence.label}`, path: `/residences/${residence.slug}` },
  ];

  return (
    <main id="main">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            residenceJsonLd(residence, dev),
            breadcrumbJsonLd(crumbs),
            // §SEO — the photographs as ImageObjects, described the way the
            // page describes them, so image search has something to read.
            ...data.residence.images.slice(0, 8).map((m) => ({ '@context': 'https://schema.org', ...imageJsonLd(m) })),
          ]),
        }}
      />
      <Breadcrumbs items={crumbs} />
      <ResidenceDetail
        fallback={residence}
        schedule={data.schedule}
        balconySqm={data.residence.balconySqm ?? data.residence.terraceSqm ?? null}
        typologyText={data.residence.description ?? data.residence.type.description ?? null}
        handover={handover}
        milestones={data.residence.paymentPlan?.milestones ?? []}
        publicData={data.residence}
      />
      <SiteFooter />
    </main>
  );
}
