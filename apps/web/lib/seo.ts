import type { DevelopmentDto, TypologyDto } from './api';
import { toMajorUnits } from '@avida/types';
import { residenceType, visiblePriceMinor, type Residence } from './residences';

/**
 * §9 task 8 — structured data. Schema.org has no "off-plan development" type,
 * so the development is a Residence with an ItemList of offers, each typology
 * an Accommodation and each residence an Apartment. Only real, currently
 * available prices are emitted: publishing a price for a sold unit is a
 * misrepresentation (§13).
 */

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

const typeUrl = (t: Pick<TypologyDto, 'slug' | 'bedrooms' | 'isPenthouse'>) =>
  `${SITE}/residences?type=${residenceType(t.isPenthouse ?? t.slug.startsWith('penthouse'), t.bedrooms)}`;

export function developmentJsonLd(dev: DevelopmentDto) {
  const available = dev.typologies.filter((t) => t.summary.priceMinorFrom !== null);
  return {
    '@context': 'https://schema.org',
    '@type': 'Residence',
    name: dev.name,
    description: dev.tagline ?? undefined,
    url: SITE,
    address: {
      '@type': 'PostalAddress',
      addressLocality: dev.city,
      addressCountry: dev.country,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: dev.latitude,
      longitude: dev.longitude,
    },
    numberOfAccommodationUnits: dev.summary.total,
    numberOfAvailableAccommodationUnits: dev.summary.available,
    makesOffer: available.map((t) => ({
      '@type': 'Offer',
      name: t.name,
      url: typeUrl(t),
      priceCurrency: dev.currency,
      price: toMajorUnits(t.summary.priceMinorFrom ?? 0, dev.currency),
      availability: 'https://schema.org/InStock',
      itemOffered: {
        '@type': 'Accommodation',
        name: t.name,
        numberOfBedrooms: t.bedrooms,
        floorSize: { '@type': 'QuantitativeValue', value: t.areaSqmMin, unitCode: 'MTK' },
      },
    })),
  };
}

export function typologyJsonLd(typology: TypologyDto, dev: DevelopmentDto) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Accommodation',
    name: typology.name,
    url: typeUrl(typology),
    numberOfBedrooms: typology.bedrooms,
    numberOfBathroomsTotal: typology.bathrooms,
    floorSize: { '@type': 'QuantitativeValue', value: typology.areaSqmMin, unitCode: 'MTK' },
    ...(typology.summary.priceMinorFrom !== null
      ? {
          offers: {
            '@type': 'Offer',
            priceCurrency: dev.currency,
            price: toMajorUnits(typology.summary.priceMinorFrom, dev.currency),
            availability: 'https://schema.org/InStock',
          },
        }
      : {}),
  };
}

export function residenceJsonLd(r: Residence, dev: DevelopmentDto) {
  const price = visiblePriceMinor(r);
  const url = `${SITE}/residences/${r.slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Apartment',
    name: `Residence ${r.label}, ${dev.name}`,
    url,
    numberOfBedrooms: r.bedrooms,
    ...(r.bathrooms !== null ? { numberOfBathroomsTotal: r.bathrooms } : {}),
    floorLevel: r.floorLabel,
    floorSize: { '@type': 'QuantitativeValue', value: r.areaSqm, unitCode: 'MTK' },
    containedInPlace: {
      '@type': 'Residence',
      name: dev.name,
      address: { '@type': 'PostalAddress', addressLocality: dev.city, addressCountry: dev.country },
    },
    ...(price !== null
      ? {
          offers: {
            '@type': 'Offer',
            url,
            priceCurrency: r.currency,
            price: toMajorUnits(price, r.currency),
            availability: 'https://schema.org/InStock',
          },
        }
      : {}),
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `${SITE}${it.path}`,
    })),
  };
}
