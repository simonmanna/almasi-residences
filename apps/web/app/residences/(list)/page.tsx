import type { Metadata } from 'next';
import { getDevelopment, getTypologyCards } from '../../../lib/api';
import { pageMetadata } from '../../../lib/page-metadata';
import { filterFromSearch } from '../../../lib/residences';
import { ResidenceExplorer } from '../../../components/residences/ResidenceExplorer';
import { SiteFooter } from '../../../components/layout/SiteFooter';

/** The admin's metadata for /residences (Website → SEO); live counts fill any {tokens} in it. */
export function generateMetadata(): Promise<Metadata> {
  return pageMetadata('/residences', { title: 'Residences' });
}

export default async function ResidencesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // A residence shows its type's artwork: the inventory is a lightweight stack
  // and carries no media of its own.
  const [params, cards, dev] = await Promise.all([
    searchParams,
    getTypologyCards().catch(() => []),
    getDevelopment().catch(() => null),
  ]);
  const { filter, sort } = filterFromSearch(params);
  const place = dev ? `${dev.city}, ${dev.country === 'RW' ? 'Rwanda' : dev.country}` : '';
  return (
    <main id="main">
      <ResidenceExplorer initialFilter={filter} initialSort={sort} cards={cards} place={place} />
      <SiteFooter />
    </main>
  );
}
