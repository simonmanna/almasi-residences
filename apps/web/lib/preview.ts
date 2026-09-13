/** The cookie that carries the admin's signed preview token while Draft Mode is on. */
export const PREVIEW_COOKIE = 'almasi_preview';

/**
 * The preview token for this request, or null. Only reads cookies once Draft
 * Mode is on, so ordinary visitors' pages stay statically rendered.
 */
export async function previewToken(): Promise<string | null> {
  const { draftMode, cookies } = await import('next/headers');
  try {
    if (!(await draftMode()).isEnabled) return null;
    return (await cookies()).get(PREVIEW_COOKIE)?.value ?? null;
  } catch {
    // Outside a request (build-time generateStaticParams, sitemap): no preview.
    return null;
  }
}
