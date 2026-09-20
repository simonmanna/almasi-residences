import { NextResponse, type NextRequest } from 'next/server';

/**
 * §SEO — old links must still arrive somewhere.
 *
 * Every redirect is a row the admin can see and edit (Website → Redirects);
 * renaming a residence, a location page or an article writes one by itself.
 * The list is small, so it is held in memory here and refreshed on a timer
 * rather than fetched on every request.
 */
const API_URL = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const TTL_MS = 60_000;

interface Rule {
  fromPath: string;
  toPath: string;
  statusCode: number;
}

let cache: { rules: Map<string, Rule>; at: number } | null = null;
let inFlight: Promise<Map<string, Rule>> | null = null;

async function rules(): Promise<Map<string, Rule>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rules;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/redirects`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const rows = (await res.json()) as Rule[];
      const map = new Map(rows.map((r) => [normalise(r.fromPath), r]));
      cache = { rules: map, at: Date.now() };
      return map;
    } catch {
      // An unreachable API must never take the site down: the last good list
      // keeps serving, and an empty one simply redirects nothing.
      return cache?.rules ?? new Map<string, Rule>();
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

const normalise = (path: string) => (path.length > 1 ? path.replace(/\/+$/, '') : path);

export async function proxy(req: NextRequest) {
  const path = normalise(req.nextUrl.pathname);
  const rule = (await rules()).get(path);
  if (!rule) return NextResponse.next();

  const target = rule.toPath.startsWith('http') ? new URL(rule.toPath) : new URL(rule.toPath, req.nextUrl.origin);
  // A redirect keeps the query string: a campaign link with utm_* must still
  // be attributable after the hop (§CRM attribution).
  if (!rule.toPath.startsWith('http')) target.search = req.nextUrl.search;
  const status = [301, 302, 307, 308].includes(rule.statusCode) ? rule.statusCode : 301;
  // Counted where it is served, so the admin sees which rules visitors use.
  // Never awaited: a slow or dead API must not delay the hop.
  void fetch(`${API_URL}/api/v1/redirects/hit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path }),
    cache: 'no-store',
  }).catch(() => undefined);
  return NextResponse.redirect(target, status as 301 | 302 | 307 | 308);
}

export const config = {
  // Everything a visitor can land on; never the build output or the API proxy.
  matcher: ['/((?!_next/static|_next/image|api/|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|mp4|webm|glb|woff2?)$).*)'],
};
