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
    // Who is building it: the question a buyer abroad asks first, and the one
    // search engines use to connect a development to its developer.
    ...(dev.developerName
      ? { provider: { '@type': 'Organization', name: dev.developerName } }
      : {}),
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

export function residenceJsonLd(r: Residence, dev: Pick<DevelopmentDto, 'name' | 'city' | 'country'>) {
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

/**
 * The published questions, as a FAQPage. Answers are Markdown in the admin;
 * structured data wants text, so the light inline marks are stripped rather
 * than rendered.
 */
export function faqJsonLd(faqs: { question: string; answerMd: string }[]) {
  const plain = (md: string) =>
    md
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`>#]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: plain(f.answerMd) },
    })),
  };
}

// ─── Site-wide identity ──────────────────────────────────────────────────

/**
 * §SEO — who publishes this site. Emitted once, in the shell, so every page
 * inherits it; the profiles come from the admin (SEO → accounts) because a
 * `sameAs` nobody controls is worse than none.
 */
export function organizationJsonLd(
  dev: Pick<DevelopmentDto, 'name' | 'city' | 'country' | 'contact'> | null,
  site: { organizationName: string | null; organizationType: string | null; sameAs: string[] } | null,
  logoUrl?: string | null,
) {
  const name = site?.organizationName ?? dev?.name;
  if (!name) return null;
  return {
    '@context': 'https://schema.org',
    '@type': site?.organizationType ?? 'Organization',
    '@id': `${SITE}/#organization`,
    name,
    url: SITE,
    ...(logoUrl ? { logo: { '@type': 'ImageObject', url: absolute(logoUrl) } } : {}),
    ...(dev
      ? {
          address: { '@type': 'PostalAddress', addressLocality: dev.city, addressCountry: dev.country },
          ...(dev.contact?.phone ? { telephone: dev.contact.phone } : {}),
          ...(dev.contact?.email ? { email: dev.contact.email } : {}),
        }
      : {}),
    ...(site?.sameAs?.length ? { sameAs: site.sameAs } : {}),
  };
}

/** The site itself, with the search box search engines may offer. */
export function websiteJsonLd(name: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE}/#website`,
    url: SITE,
    name,
    publisher: { '@id': `${SITE}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${SITE}/residences?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

// ─── Pages that exist to be found ────────────────────────────────────────

/** A neighbourhood page: a Place, with what is actually listed on it. */
export function placeJsonLd(loc: {
  name: string;
  slug: string;
  lede: string | null;
  locality: string | null;
  region: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  hero: { url: string; altText: string | null } | null;
  landmarks: { name: string; latitude: number; longitude: number }[];
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: loc.name,
    url: `${SITE}/locations/${loc.slug}`,
    ...(loc.lede ? { description: loc.lede } : {}),
    address: {
      '@type': 'PostalAddress',
      ...(loc.locality ? { addressLocality: loc.locality } : {}),
      ...(loc.region ? { addressRegion: loc.region } : {}),
      addressCountry: loc.country,
    },
    ...(loc.latitude !== null && loc.longitude !== null
      ? { geo: { '@type': 'GeoCoordinates', latitude: loc.latitude, longitude: loc.longitude } }
      : {}),
    ...(loc.hero ? { image: imageJsonLd(loc.hero) } : {}),
    // Only the places the page lists: schema must match what is on screen.
    ...(loc.landmarks.length
      ? {
          containsPlace: loc.landmarks.slice(0, 20).map((l) => ({
            '@type': 'Place',
            name: l.name,
            geo: { '@type': 'GeoCoordinates', latitude: l.latitude, longitude: l.longitude },
          })),
        }
      : {}),
  };
}

/** One article under /insights. */
export function articleJsonLd(
  post: {
    slug: string;
    title: string;
    excerpt: string | null;
    authorName: string | null;
    publishedAt: string | null;
    updatedAt: string;
    hero: { url: string; altText: string | null } | null;
  },
  publisher: string,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    url: `${SITE}/insights/${post.slug}`,
    mainEntityOfPage: `${SITE}/insights/${post.slug}`,
    ...(post.excerpt ? { description: post.excerpt } : {}),
    ...(post.hero ? { image: imageJsonLd(post.hero) } : {}),
    ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
    dateModified: post.updatedAt,
    author: { '@type': post.authorName ? 'Person' : 'Organization', name: post.authorName ?? publisher },
    publisher: { '@id': `${SITE}/#organization` },
  };
}

/** A film, with the words spoken in it — the text a search engine can read. */
export function videoJsonLd(video: {
  label: string;
  description: string | null;
  durationSec: number;
  uploadDate: string;
  transcript: string | null;
  poster: { url: string } | null;
  video: { url: string } | null;
  chapters: { startSec: number; label: string }[];
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: video.label,
    ...(video.description ? { description: video.description } : {}),
    duration: isoDuration(video.durationSec),
    uploadDate: video.uploadDate,
    ...(video.poster ? { thumbnailUrl: absolute(video.poster.url) } : {}),
    ...(video.video ? { contentUrl: absolute(video.video.url) } : {}),
    ...(video.transcript ? { transcript: video.transcript } : {}),
    ...(video.chapters.length
      ? {
          hasPart: video.chapters.map((c, i, all) => ({
            '@type': 'Clip',
            name: c.label,
            startOffset: Math.round(c.startSec),
            endOffset: Math.round(all[i + 1]?.startSec ?? video.durationSec),
          })),
        }
      : {}),
  };
}

/** A picture, described the way it is described on the page. */
export function imageJsonLd(image: { url: string; altText: string | null; width?: number | null; height?: number | null; caption?: string | null }) {
  return {
    '@type': 'ImageObject',
    url: absolute(image.url),
    ...(image.width ? { width: image.width } : {}),
    ...(image.height ? { height: image.height } : {}),
    ...(image.altText ? { name: image.altText } : {}),
    ...(image.caption ? { caption: image.caption } : {}),
  };
}

/** 245 seconds → "PT4M5S", as schema.org wants it. */
function isoDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `PT${h ? `${h}H` : ''}${m ? `${m}M` : ''}${s % 60 || (!h && !m) ? `${s % 60}S` : ''}`;
}

/** A media URL may be API-relative; structured data needs the absolute one. */
function absolute(url: string): string {
  return url.startsWith('http') ? url : `${SITE}${url}`;
}
