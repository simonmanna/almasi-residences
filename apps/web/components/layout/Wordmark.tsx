'use client';

import { useBrandLogo } from '../providers/BrandProvider';

/**
 * The site's mark. When the admin has uploaded a logo (Property → Logo) that
 * image is the mark; otherwise the drawn Almasi mark: two ridgelines, one
 * behind the other — Kigali's hills, and the facets of the diamond the name
 * means in Swahili. Drawn as strokes so it takes the colour of its ground.
 */
export function Wordmark({ withName = true, size = 38 }: { withName?: boolean; size?: number }) {
  const logo = useBrandLogo();
  return (
    <span className="wordmark">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- a small mark from the media origin; no optimisation needed
        <img
          className="wordmark-logo"
          src={logo.thumbUrl || logo.url}
          alt=""
          width={size}
          height={logo.width && logo.height ? Math.round((size * logo.height) / logo.width) : size}
          decoding="async"
        />
      ) : (
        <svg
          viewBox="0 0 44 26"
          width={size}
          height={Math.round((size * 26) / 44)}
          aria-hidden="true"
          focusable="false"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.15"
          strokeLinejoin="miter"
        >
          <path d="M1 25 L13.5 9.5 L20.5 18" />
          <path d="M5.5 25 L13.5 15 L18 20.5" />
          <path d="M12 25 L27 3 L43 25" />
          <path d="M17.5 25 L27 11 L37 25" />
        </svg>
      )}
      {withName && <span className="wordmark-name">ALMASI</span>}
    </span>
  );
}
