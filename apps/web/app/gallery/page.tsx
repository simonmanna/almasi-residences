import type { Metadata } from 'next';
import Link from 'next/link';
import { copy, copyLines, getGalleries, getPagesSafe } from '../../lib/api';
import { pageMetadata } from '../../lib/page-metadata';
import { PageHeader, TitleLines } from '../../components/layout/PageHero';
import { GalleryGrid } from '../../components/gallery/GalleryGrid';
import { SiteFooter } from '../../components/layout/SiteFooter';

export const revalidate = 3600;

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata('/gallery', { title: 'Gallery' });
}

/** The galleries are the ones published in the admin (§16), in the admin's order. */
export default async function GalleryPage() {
  const [pages, galleries] = await Promise.all([getPagesSafe(), getGalleries().catch(() => [])]);
  return (
    <main id="main">
      <PageHeader
        kicker={copy(pages, 'gallery', 'heroKicker')}
        title={<TitleLines lines={copyLines(pages, 'gallery', 'heroTitle')} />}
        lede={copy(pages, 'gallery', 'heroLede')}
      />
      <div className="container" style={{ marginBottom: 32 }}>
        <Link href="/film" className="btn btn--solid">
          Watch the film
        </Link>
      </div>
      <GalleryGrid galleries={galleries} />
      <SiteFooter />
    </main>
  );
}
