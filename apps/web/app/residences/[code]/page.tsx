import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatQuarter } from '@avida/types';
import { getDevelopment, getInventory, getPublicResidence, getUnit } from '../../../lib/api';
import {
  ORIENTATION_TEXT,
  STATUS_TEXT,
  TYPE_TEXT,
  findResidence,
  toResidences,
} from '../../../lib/residences';
import { breadcrumbJsonLd, residenceJsonLd } from '../../../lib/seo';
import { ResidenceDetail } from '../../../components/residence/ResidenceDetail';
import { SiteFooter } from '../../../components/layout/SiteFooter';

/** Status changes reach this page within a minute; admin saves revalidate it at once (§37). */
export const revalidate = 60;

async function load(code: string) {
  const [inventory, dev] = await Promise.all([getInventory(), getDevelopment()]);
  const bathrooms = Object.fromEntries(dev.typologies.map((t) => [t.slug, t.bathrooms]));
  return { dev, residence: findResidence(toResidences(inventory, bathrooms), code) };
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
  const r = await load(code)
    .then((x) => x.residence)
    .catch(() => undefined);
  // Thrown here, before the page streams, so the response is a real 404 rather than a soft one.
  if (!r) notFound();
  const pub = await getPublicResidence(r.slug).catch(() => null);
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
  const { dev, residence } = await load(code);
  if (!residence) notFound();

  const [detail, pub] = await Promise.all([getUnit(residence.id).catch(() => null), getPublicResidence(residence.slug).catch(() => null)]);
  const typology = dev.typologies.find((t) => t.slug === residence.typologySlug);
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
        schedule={detail?.schedule ?? null}
        balconySqm={detail?.balconySqm ?? detail?.terraceSqm ?? null}
        typologyText={pub?.description ?? typology?.descriptionMd ?? null}
        handover={handover}
        milestones={dev.milestones}
        publicData={pub}
      />
      <SiteFooter />
    </main>
  );
}
