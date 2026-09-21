import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The admin reads the CSRF cookie with document.cookie, so in production the
 * API has to be reached through the admin's own host. If the admin is built to
 * call api.<domain> directly, every save fails with 403 — but only once deployed.
 */
const infra = resolve(__dirname, '../../../infra');
const compose = readFileSync(resolve(infra, 'docker-compose.prod.yml'), 'utf8');
const caddy = readFileSync(resolve(infra, 'Caddyfile'), 'utf8');

function siteBlock(host: string): string {
  const start = caddy.indexOf(`{$SCHEME}://${host} {`);
  expect(start, `Caddy site ${host}`).toBeGreaterThanOrEqual(0);
  const lines = caddy.slice(start).split('\n');
  const end = lines.findIndex((l, i) => i > 0 && l === '}');
  return lines.slice(0, end + 1).join('\n');
}

describe('production admin topology', () => {
  it('builds the admin to call the API on its own origin', () => {
    const urls = [...compose.matchAll(/VITE_API_URL:\s*(\S+)/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url).toBe('${SCHEME}://admin.${DOMAIN}');
  });

  it('proxies /api/* on the admin host before the SPA fallback', () => {
    const block = siteBlock('admin.{$DOMAIN}');
    const proxy = block.indexOf('handle /api/* {');
    const spa = block.indexOf('try_files');
    expect(proxy).toBeGreaterThanOrEqual(0);
    expect(block.slice(proxy)).toMatch(/handle \/api\/\* \{\s*reverse_proxy api:3001/);
    // try_files is ordered before handle by Caddy, so it must sit inside its own handle.
    expect(block.slice(0, spa)).toMatch(/\thandle \{[^}]*$/);
  });
});

describe('production public-site topology', () => {
  it('sends same-origin /api/v1 calls straight to the API', () => {
    // The enquiry form posts to /api/v1/enquiry on the site's own host. Next's
    // rewrite of that path is baked at build time with the build host's
    // loopback address, so the proxy must happen in Caddy.
    const block = siteBlock('{$DOMAIN}');
    expect(block).toMatch(/handle \/api\/v1\/\* \{\s*reverse_proxy api:3001/);
    expect(block.indexOf('handle /api/v1/*')).toBeLessThan(block.indexOf('reverse_proxy web:3000'));
  });
});
