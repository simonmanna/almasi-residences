import type { Metadata } from 'next';
import Link from 'next/link';
import { copy, getGalleries, getPagesSafe } from '../../lib/api';
import { twoLines } from '../../lib/text';
import { PageHeader } from '../../components/layout/PageHero';
import { GalleryGrid } from '../../components/gallery/GalleryGrid';
import { SiteFooter } from '../../components/layout/SiteFooter';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Gallery',
  description:
    'Images of Almasi Residences, Kimihurura: the building at dusk, the residences, the penthouses, the amenities and indicative furnished plans.',
  alternates: { canonical: '/gallery' },
};

/** The galleries are the ones published in the admin (§16), in the admin's order. */
export default async function GalleryPage() {
  const [pages, galleries] = await Promise.all([getPagesSafe(), getGalleries().catch(() => [])]);
  const [a, b] = twoLines(copy(pages, 'gallery', 'heroTitle', 'Stone, walnut, evening light.'));
  return (
    <main id="main">
      <PageHeader
        kicker="Gallery"
        title={
          <>
            {a}
            {b && (
              <>
                <br />
                <span className="italic">{b}</span>
              </>
            )}
          </>
        }
        lede={copy(pages, 'gallery', 'heroLede', 'The building, its residences and the spaces around them. Prefer it moving? The film runs under a minute.')}
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
