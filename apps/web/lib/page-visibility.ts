import { notFound } from 'next/navigation';
import { isPageVisible, PAGE_VISIBILITY } from '@avida/types';
import { getPagesSafe, type PagesDto } from './api';

/**
 * Website → Pages and navigation. A page the admin switched off leaves the
 * navigation, drops out of the sitemap and answers "page not found".
 *
 * An unreachable CMS must never take the site down, so every read here fails
 * open: with no answer, every page is shown.
 */
export const isVisible = (pages: PagesDto, key: string) => isPageVisible(pages.pageVisibility, key);

/** The visible pages that carry a link in the top navigation, in order. */
export const navLinksFor = (pages: PagesDto) =>
  PAGE_VISIBILITY.filter((p) => p.inNav && isVisible(pages, p.key)).map((p) => ({ href: p.path, label: p.label }));

/** Called by a page the admin may have switched off. */
export async function assertPageVisible(key: string): Promise<void> {
  if (!isVisible(await getPagesSafe(), key)) notFound();
}
