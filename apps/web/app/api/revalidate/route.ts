import { revalidatePath } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * §11 — the API calls this on any content or inventory change, so a status
 * flipped in the admin reaches the public site without a deploy. The client's
 * 60-second poll of /inventory/live is the backstop if this fails (§6.7).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Revalidation is not configured' }, { status: 503 });
  }
  if (request.headers.get('x-revalidate-secret') !== secret) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { paths?: string[] };
  const paths = body.paths?.length ? body.paths : ['/', '/availability', '/residences'];

  for (const path of paths) revalidatePath(path);

  return NextResponse.json({ revalidated: paths, at: new Date().toISOString() });
}
