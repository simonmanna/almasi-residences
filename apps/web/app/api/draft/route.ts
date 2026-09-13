import { cookies, draftMode } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { PREVIEW_COOKIE } from '../../../lib/preview';

const API_URL = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * §40.2 — the admin's "Preview" link lands here. The token is checked with the
 * API (which signed it); only then does the browser enter Draft Mode, where
 * every read sends the token and drafts show. A token that fails verification
 * never enables anything.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  const raw = request.nextUrl.searchParams.get('path') ?? '/';
  // Only a path on this site: never an open redirect.
  const path = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';

  const res = await fetch(`${API_URL}/api/v1/preview/verify`, { headers: { 'x-preview-token': token }, cache: 'no-store' }).catch(() => null);
  if (!res?.ok) {
    return new NextResponse('This preview link has expired or is not valid. Open a new one from the admin.', { status: 401, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  (await draftMode()).enable();
  (await cookies()).set(PREVIEW_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: 60 * 60,
  });
  return NextResponse.redirect(new URL(path, request.nextUrl.origin));
}
