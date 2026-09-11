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

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
  },
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${API_URL}/api/v1/:path*` }];
  },
  async headers() {
    // §5.9 — security headers. CSP arrives with the nonce plumbing; these
    // cost nothing now and are easy to forget later.
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      {
        // Rendered media is replaced under a new name, never edited in place.
        source: '/media/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

export default nextConfig;
