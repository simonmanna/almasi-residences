import { DEVELOPMENT_SLUG } from './slug';

/**
 * Browser-side path. next.config rewrites /api/v1/* to the API, so client
 * fetches are same-origin and never carry the API host.
 */
export const livePath = (slug: string = DEVELOPMENT_SLUG) =>
  `/api/v1/inventory/live?development=${encodeURIComponent(slug)}`;
