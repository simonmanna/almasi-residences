import { revalidatePath } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * §11 / §37 — the API calls this after any admin write a visitor could see, so
 * a price, status, image or copy change reaches the public site without a
 * deploy. A path with a dynamic segment (`/residences/[code]`) revalidates
 * every page of that route. The client's 60-second poll of /inventory/live is
 * the backstop for availability if this call fails (§6.7).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Revalidation is not configured' }, { status: 503 });
  }
  if (request.headers.get('x-revalidate-secret') !== secret) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { paths?: unknown };
  const paths =
    Array.isArray(body.paths) && body.paths.every((p) => typeof p === 'string' && p.startsWith('/'))
      ? (body.paths as string[])
      : ['/', '/residences', '/residences/[code]'];

  for (const path of paths) {
    if (path.includes('[')) revalidatePath(path, 'page');
    else revalidatePath(path);
  }

  return NextResponse.json({ revalidated: paths, at: new Date().toISOString() });
}
