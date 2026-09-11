import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '../../components/layout/PageHero';
import { GalleryGrid } from '../../components/gallery/GalleryGrid';
import { SiteFooter } from '../../components/layout/SiteFooter';

export const metadata: Metadata = {
  title: 'Gallery',
  description:
    'Images of Almasi Residences, Kimihurura: the building at dusk, the residences, the penthouses, the amenities and indicative furnished plans.',
  alternates: { canonical: '/gallery' },
};

export default function GalleryPage() {
  return (
    <main id="main">
      <PageHeader
        kicker="Gallery"
        title={
          <>
            Stone, walnut,
            <br />
            <span className="italic">evening light.</span>
          </>
        }
        lede="The building, its residences and the spaces around them. Prefer it moving? The film runs under a minute."
      />
      <div className="container" style={{ marginBottom: 32 }}>
        <Link href="/film" className="btn btn--solid">
          Watch the film
        </Link>
      </div>
      <GalleryGrid />
      <SiteFooter />
    </main>
  );
}
