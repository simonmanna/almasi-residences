import { Header } from '@nestjs/common';

/** §5.2 — the default public read cache policy. Method-level: Nest's `Header`
 * decorator reads the method descriptor and cannot be applied to a class. */
export const PublicCache = (): MethodDecorator =>
  Header('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');

/** §5.3 — /inventory/live is never cached; it is the freshness guarantee. */
export const NoStore = (): MethodDecorator => Header('Cache-Control', 'no-store');
