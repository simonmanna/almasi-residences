/** The public website, for “view on the site” and preview links. */
export const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined) || 'http://localhost:3000';

/** Where each CMS page's words appear on the website. */
export const PAGE_PATH: Record<string, string> = {
  home: '/',
  featuredSection: '/',
  locationSection: '/',
  about: '/buying',
  residences: '/residences',
  amenities: '/amenities',
  location: '/location',
  buying: '/buying',
  gallery: '/gallery',
  progress: '/progress',
  film: '/film',
  contact: '/enquire',
};
