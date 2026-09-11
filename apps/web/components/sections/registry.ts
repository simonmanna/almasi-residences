/**
 * §6.1 — the shared section registry. Both UI modes render the same section
 * components; the registry says where each one lives in multi-page mode and
 * what the navigation calls it. One list, so the two modes cannot drift.
 */
export const SECTIONS = {
  hero: { id: 'hero', label: 'Overview', route: '/' },
  narrative: { id: 'narrative', label: 'The building', route: '/' },
  residences: { id: 'residences', label: 'Residences', route: '/residences' },
  availability: { id: 'availability', label: 'Availability', route: '/availability' },
  amenities: { id: 'amenities', label: 'Amenities', route: '/residences' },
  location: { id: 'location', label: 'Location', route: '/location' },
  gallery: { id: 'gallery', label: 'Gallery', route: '/gallery' },
  concierge: { id: 'concierge', label: 'Ask', route: '/availability' },
  progress: { id: 'progress', label: 'Progress', route: '/progress' },
  payment: { id: 'payment', label: 'Payment plan', route: '/availability' },
  developer: { id: 'developer', label: 'The developer', route: '/' },
  faq: { id: 'faq', label: 'Questions', route: '/' },
  enquire: { id: 'enquire', label: 'Enquire', route: '/enquire' },
} as const;

export type SectionId = keyof typeof SECTIONS;

/** The order sections appear in single-page mode. */
export const SINGLE_PAGE_ORDER: SectionId[] = [
  'hero',
  'narrative',
  'residences',
  'availability',
  'concierge',
  'amenities',
  'location',
  'gallery',
  'payment',
  'progress',
  'developer',
  'faq',
  'enquire',
];

/** What the primary navigation offers. Not every section earns a nav entry. */
export const NAV_SECTIONS: SectionId[] = [
  'residences',
  'availability',
  'gallery',
  'location',
  'progress',
  'enquire',
];

export function hrefFor(id: SectionId, mode: 'single' | 'multi'): string {
  return mode === 'single' ? `#${SECTIONS[id].id}` : SECTIONS[id].route;
}
