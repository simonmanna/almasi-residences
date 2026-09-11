import { NextResponse, type NextRequest } from 'next/server';

/**
 * Next 16's `proxy` convention (DECISIONS D-09). Since the redesign (D-28) it
 * only keeps old public URLs alive, so links and search results from before
 * still land somewhere real:
 *   /availability               → /residences
 *   /residences/<typology-slug> → /residences?type=<type>
 *   ?ui=single|multi            → dropped (one design now), cookie cleared
 */
const TYPOLOGY_TO_TYPE: Record<string, string> = {
  'one-bed': 'one-bedroom',
  'two-bed': 'two-bedroom',
  'two-bed-corner': 'two-bedroom',
  'penthouse-two': 'penthouse',
  'penthouse-three': 'penthouse',
};

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();

  if (url.pathname === '/availability') {
    url.pathname = '/residences';
    return NextResponse.redirect(url, 308);
  }

  const typology = url.pathname.match(/^\/residences\/([a-z-]+)$/)?.[1];
  if (typology && TYPOLOGY_TO_TYPE[typology]) {
    url.pathname = '/residences';
    url.searchParams.set('type', TYPOLOGY_TO_TYPE[typology]!);
    return NextResponse.redirect(url, 308);
  }

  if (url.searchParams.has('ui')) {
    url.searchParams.delete('ui');
    const res = NextResponse.redirect(url, 308);
    res.cookies.delete('ui_mode');
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/availability', '/residences/:path*', '/'],
};
