import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatQuarter } from '@avida/types';
import { getInventory, getResidencePage, type PublicResidenceDto } from '../../../lib/api';
import {
  ORIENTATION_TEXT,
  STATUS_TEXT,
  TYPE_TEXT,
  residenceType,
  toResidences,
  type Residence,
} from '../../../lib/residences';
import { breadcrumbJsonLd, residenceJsonLd } from '../../../lib/seo';
import { ResidenceDetail } from '../../../components/residence/ResidenceDetail';
import { SiteFooter } from '../../../components/layout/SiteFooter';

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
  const data = await getResidencePage(code)
    .catch(() => undefined);
  // Thrown here, before the page streams, so the response is a real 404 rather than a soft one.
  if (!data) notFound();
  const pub = data.residence;
  const r = toResidence(pub);
  const title = `Residence ${r.label}: ${TYPE_TEXT[r.type].toLowerCase()}, ${r.areaSqm} m²`;
  const description =
    pub?.shortDescription ??
    `${TYPE_TEXT[r.type]} residence ${r.label}: ${r.areaSqm} m² on ${r.floorLabel.toLowerCase()}, facing ${ORIENTATION_TEXT[r.orientation].toLowerCase()}. ${STATUS_TEXT[r.publicStatus]}.`;
  const cover = pub?.images[0];
  return {
    title,
    description,
    alternates: { canonical: `/residences/${r.slug}` },
    openGraph: {
      title,
      description,
      images: cover ? [{ url: cover.url, width: cover.width ?? undefined, height: cover.height ?? undefined, alt: cover.altText ?? title }] : undefined,
    },
  };
}

export default async function ResidencePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const data = await getResidencePage(code).catch(() => null);
  if (!data) notFound();
  const residence = toResidence(data.residence);
  const dev = data.property;
  const handover = dev.handoverDate ? formatQuarter(dev.handoverDate) : null;

  return (
    <main id="main">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            residenceJsonLd(residence, dev),
            breadcrumbJsonLd([
              { name: dev.name, path: '/' },
              { name: 'Residences', path: '/residences' },
              { name: residence.label, path: `/residences/${residence.slug}` },
            ]),
          ]),
        }}
      />
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
