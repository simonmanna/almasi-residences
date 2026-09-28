import type { Metadata } from 'next';
import { getDevelopment, getTypologyCards } from '../../../lib/api';
import { pageMetadata } from '../../../lib/page-metadata';
import { filterFromSearch } from '../../../lib/residences';
import { ResidenceExplorer } from '../../../components/residences/ResidenceExplorer';
import { SiteFooter } from '../../../components/layout/SiteFooter';
import { assertPageVisible } from '../../../lib/page-visibility';

/** The admin's metadata for /residences (Website → SEO); live counts fill any {tokens} in it. */
export function generateMetadata(): Promise<Metadata> {
  return pageMetadata('/residences', { title: 'Residences' });
}

/**
 * Static and refreshed like every other page: the filters in the URL are
 * applied by ResidenceExplorer in the browser, so a filtered link is served
 * from the same cached page instead of being rendered per request.
 */
export const revalidate = 3600;

const DEFAULTS = filterFromSearch({});

export default async function ResidencesPage() {
  await assertPageVisible('residences');

  // A residence shows its type's artwork: the inventory is a lightweight stack
  // and carries no media of its own.
  const [cards, dev] = await Promise.all([getTypologyCards().catch(() => []), getDevelopment().catch(() => null)]);
  const { filter, sort } = DEFAULTS;
  const place = dev ? `${dev.city}, ${dev.country === 'RW' ? 'Rwanda' : dev.country}` : '';
  return (
    <main id="main">
      <ResidenceExplorer initialFilter={filter} initialSort={sort} cards={cards} place={place} />
      <SiteFooter />
    </main>
  );
}
