import type { MetadataRoute } from 'next';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // The API proxy and legacy mode switches carry no content of their own.
      disallow: ['/api/', '/*?ui='],
    },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
