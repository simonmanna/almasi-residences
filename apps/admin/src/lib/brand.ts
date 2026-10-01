import { useEffect } from 'react';
import { get } from './api';
import { useQuery } from './query';

interface PublicLogo {
  url: string;
  thumbUrl: string;
  altText: string | null;
}

/**
 * Property → Logo, read from the public property record so every signed-in
 * user (and the sign-in page) sees it, not only those who may edit the
 * property. Keyed under `property` so saving the property refreshes it.
 */
export function useBrandLogo() {
  const { data } = useQuery('property:logo', () => get<{ logo: PublicLogo | null }>('/property'));
  const logo = data?.logo ?? null;
  const src = logo ? logo.thumbUrl || logo.url : null;

  // The tab icon follows the uploaded logo; index.html's drawn diamond stays until it loads.
  useEffect(() => {
    if (!src) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.removeAttribute('type');
    link.href = src;
  }, [src]);

  return src;
}
