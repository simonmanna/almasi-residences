import { cookies, draftMode } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { PREVIEW_COOKIE } from '../../../../lib/preview';

/** Leaves preview: back to exactly what a visitor sees. */
export async function GET(request: NextRequest) {
  (await draftMode()).disable();
  (await cookies()).delete(PREVIEW_COOKIE);
  const raw = request.nextUrl.searchParams.get('path') ?? '/';
  const path = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
  return NextResponse.redirect(new URL(path, request.nextUrl.origin));
}
