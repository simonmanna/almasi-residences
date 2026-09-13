import type { Metadata } from 'next';
import { pageMetadata } from '../../lib/page-metadata';
import { filterFromSearch } from '../../lib/residences';
import { ResidenceExplorer } from '../../components/residences/ResidenceExplorer';
import { SiteFooter } from '../../components/layout/SiteFooter';

/** The admin's metadata for /residences (Website → SEO); live counts fill any {tokens} in it. */
export function generateMetadata(): Promise<Metadata> {
  return pageMetadata('/residences', { title: 'Residences' });
}

export default async function ResidencesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { filter, sort } = filterFromSearch(await searchParams);
  return (
    <main id="main">
      <ResidenceExplorer initialFilter={filter} initialSort={sort} />
      <SiteFooter />
    </main>
  );
}
