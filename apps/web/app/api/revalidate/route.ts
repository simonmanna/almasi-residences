import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';
import { SITE_TAGS } from '@avida/types';

const KNOWN = new Set<string>(Object.values(SITE_TAGS));

function sameSecret(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * §11 / §37 — the API calls this after any admin write a visitor could see, and
 * retries until it succeeds (SyncEvent). Every API read on this site carries
 * cache tags (lib/api.ts), so invalidation names what changed rather than
 * guessing which paths read it. Expiry is immediate: the next visitor gets the
 * new content, not a stale page that refreshes behind them.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Revalidation is not configured' }, { status: 503 });
  }
  if (!sameSecret(request.headers.get('x-revalidate-secret'), secret)) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { tags?: unknown };
  const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === 'string' && KNOWN.has(t)) : [];
  // A malformed body refreshes everything: over-refreshing is safe, missing a change is not.
  const effective = tags.length ? tags : [SITE_TAGS.site];
  for (const tag of effective) revalidateTag(tag, { expire: 0 });

  return NextResponse.json({ revalidated: effective, at: new Date().toISOString() });
}
