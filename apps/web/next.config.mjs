import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

// DECISIONS D-03 — one .env, at the repo root. Next only reads its own
// directory, so the root file is folded in here. Values already present in the
// environment (CI, Docker, a shell export) always win.
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnv)) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync(rootEnv, 'utf8')))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

// Where the Next server reaches the API. Browsers never call the API origin
// directly: /api/v1/* is rewritten below, so client fetches stay same-origin
// (no CORS preflight, no API host baked into the bundle).
const API_URL =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Where uploaded media is served from in production (the S3-compatible bucket).
// Empty in development, where everything is same-origin through the rewrite below.
const MEDIA_ORIGIN = process.env.NEXT_PUBLIC_MEDIA_URL
  ? new URL(process.env.NEXT_PUBLIC_MEDIA_URL).origin
  : '';

/**
 * §5.9 — the site's Content-Security-Policy.
 *
 * What this closes: framing, plugins, base-tag hijacking, form posts to another
 * origin, and loading images, fonts, media, styles or scripts from anywhere but
 * this origin and the media bucket.
 *
 * What it does NOT close, and why: `script-src` keeps `'unsafe-inline'`. Next
 * inlines its own bootstrap and flight-data scripts, and the only way to allow
 * those without `'unsafe-inline'` is a per-request nonce — which requires
 * reading `headers()` in the root layout, which opts every page out of static
 * rendering. This site's whole delivery model is ISR, so the trade is not worth
 * making for a site whose HTML contains no visitor-supplied text: everything
 * rendered comes from the admin database through JSON.stringify or React's own
 * escaping. Revisit if the site ever renders anything a visitor can influence.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `img-src 'self' data: blob:${MEDIA_ORIGIN ? ` ${MEDIA_ORIGIN}` : ''}`,
  `media-src 'self' blob:${MEDIA_ORIGIN ? ` ${MEDIA_ORIGIN}` : ''}`,
  "font-src 'self'",
  // CSS modules are files; Next still injects a little inline style.
  "style-src 'self' 'unsafe-inline'",
  // 'unsafe-eval' is React Refresh in development only.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
  // GLTFLoader decodes embedded GLB textures through local blob URLs.
  `connect-src 'self' blob:${MEDIA_ORIGIN ? ` ${MEDIA_ORIGIN}` : ''}`,
  // Nothing is embedded: the site frames no third-party content at all.
  "frame-src 'none'",
  "worker-src 'self' blob:",
  'upgrade-insecure-requests',
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Caddy compresses (zstd/gzip) in front; compressing here too wastes Node CPU.
  compress: process.env.NODE_ENV !== 'production',
  poweredByHeader: false,
  // The Docker image ships only the traced server files, not the workspace.
  // Traced from the repo root so workspace packages (@avida/types) come along.
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  // Keep the development-only Next.js badge out of the public UI.
  devIndicators: false,
  // Lets a second server (preview, e2e) run beside `pnpm dev` without both
  // writing into the same .next directory.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // …and without type-checking the other server's generated route types.
  typescript: { tsconfigPath: process.env.NEXT_DIST_DIR ? 'tsconfig.dist.json' : 'tsconfig.json' },
  transpilePackages: ['@avida/types'],
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 828, 1080, 1280, 1600, 1920, 2560],
    imageSizes: [96, 160, 256, 384, 512],
    qualities: [60, 70, 75, 82],
    // Sources are never edited in place, so an optimized variant stays valid.
    minimumCacheTTL: 31536000,
  },
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${API_URL}/api/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          // Nothing on this site uses a camera, a microphone or the visitor's
          // location; the map is a drawing and the coordinates come from the API.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
        ],
      },
      {
        // Rendered media is replaced under a new name, never edited in place.
        source: '/media/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/:dir(models|themes|fonts)/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=2592000' }],
      },
    ];
  },
};

export default nextConfig;
