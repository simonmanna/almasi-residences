import { expect, request, test } from '@playwright/test';
import { AdminApi, apiUrl, eventually, publicJson } from './admin-api';

const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const html = (path: string) => fetch(`${WEB}${path}`, { cache: 'no-store' }).then((r) => r.text());

/**
 * Roadmap phase 2 — safe publishing. An edit is a draft until someone allowed
 * to publish publishes it; a preview shows the draft on the real page; an
 * archived record leaves the website and can be restored.
 */
test.describe('safe publishing', () => {
  let owner: AdminApi;

  test.beforeAll(async () => {
    owner = await AdminApi.as('owner');
  });
  test.afterAll(async () => {
    await owner.dispose();
  });

  test('S1. a page edit is a draft: visitors keep the published copy until it is published', async () => {
    const before = await owner.get<{ content: Record<string, string>; publishedContent: Record<string, string> }>('/admin/pages/gallery');
    const live = before.publishedContent.heroLede ?? '';
    const draft = `E2E draft lede ${Date.now()}`;
    try {
      await owner.put('/admin/pages/gallery', { content: { heroLede: draft } });
      const pub = await publicJson<Record<string, Record<string, string>>>('/pages');
      expect(pub.gallery!.heroLede, 'a draft must not reach visitors').not.toBe(draft);

      const page = await owner.get<{ hasDraft: boolean; draftFields: string[] }>('/admin/pages/gallery');
      expect(page.hasDraft).toBe(true);
      expect(page.draftFields).toContain('heroLede');

      await owner.post('/admin/pages/gallery/publish');
      const after = await publicJson<Record<string, Record<string, string>>>('/pages');
      expect(after.gallery!.heroLede).toBe(draft);
    } finally {
      await owner.put('/admin/pages/gallery', { content: { heroLede: live }, publish: true });
    }
  });

  test('S2. a preview token shows drafts on the real page; without it, nothing changes', async ({ browser }) => {
    const before = await owner.get<{ publishedContent: Record<string, string> }>('/admin/pages/location');
    const draft = `E2E preview-only lede ${Date.now()}`;
    await owner.put('/admin/pages/location', { content: { heroLede: draft } });
    try {
      const { url } = await owner.post<{ url: string }>('/admin/preview', { path: '/location' });
      expect(url).toContain('/api/draft?token=');

      // The API honours the token and refuses a forged one.
      const token = new URL(url).searchParams.get('token')!;
      const api = await request.newContext();
      const withToken = await (await api.get(apiUrl('/pages'), { headers: { 'x-preview-token': token } })).json();
      expect(withToken.location.heroLede).toBe(draft);
      const forged = await (await api.get(apiUrl('/pages'), { headers: { 'x-preview-token': `${token.slice(0, -2)}xx` } })).json();
      expect(forged.location.heroLede).not.toBe(draft);
      expect((await api.get(apiUrl('/preview/verify'), { headers: { 'x-preview-token': 'nope' } })).status()).toBe(401);
      await api.dispose();

      // The website: the preview link enters Draft Mode and the page shows the draft with a banner.
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(url.replace(/^https?:\/\/[^/]+/, WEB));
      await expect(page.getByText(draft)).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: 'Preview' })).toBeVisible();
      await context.close();

      // A visitor still sees the published copy.
      expect(await html('/location')).not.toContain(draft);
    } finally {
      await owner.post('/admin/pages/location/discard');
      expect((await owner.get<{ hasDraft: boolean }>('/admin/pages/location')).hasDraft).toBe(false);
      void before;
    }
  });

  test('S3. archiving an amenity takes it off the website; restoring and publishing brings it back', async () => {
    const created = await owner.post<{ id: string; name: string }>('/admin/amenities', { name: `E2E rooftop ${Date.now()}`, published: true });
    try {
      const names = async () => (await publicJson<{ name: string }[]>('/amenities')).map((a) => a.name);
      expect(await names()).toContain(created.name);

      await owner.post(`/admin/publishing/amenity/${created.id}/archive`);
      expect(await names()).not.toContain(created.name);
      const overview = await owner.get<{ archived: { id: string }[] }>('/admin/publishing');
      expect(overview.archived.map((x) => x.id)).toContain(created.id);

      await owner.post(`/admin/publishing/amenity/${created.id}/restore`);
      expect(await names(), 'a restored record stays unpublished until someone publishes it').not.toContain(created.name);
      await owner.post(`/admin/publishing/amenity/${created.id}/publish`);
      expect(await names()).toContain(created.name);
    } finally {
      await owner.post(`/admin/publishing/amenity/${created.id}/archive`);
      await owner.del(`/admin/publishing/amenity/${created.id}`);
    }
  });

  test('S4. only a role with content.publish can put marketing content live', async () => {
    const sales = await AdminApi.as('sales');
    try {
      const faq = await owner.post<{ id: string; published: boolean; publishedAt: string | null }>('/admin/faqs', { question: `E2E question ${Date.now()}?`, answerMd: 'An answer.' });
      expect(faq.published).toBe(true);
      expect(faq.publishedAt).not.toBeNull();

      const res = await sales.raw().post(sales.apiUrl(`/admin/publishing/faq/${faq.id}/unpublish`), { headers: sales.headers });
      expect(res.status(), 'sales may not take content down').toBe(403);

      await owner.post(`/admin/publishing/faq/${faq.id}/archive`);
      await owner.del(`/admin/publishing/faq/${faq.id}`);
    } finally {
      await sales.dispose();
    }
  });

  test('S5. the website reaches a residence that is unpublished only in preview', async () => {
    const list = await owner.get<{ data: { id: string; code: string; published: boolean; status: string }[] }>('/admin/residences?status=AVAILABLE&pageSize=50');
    const r = list.data.find((x) => x.published)!;
    await owner.patch(`/admin/residences/${r.id}`, { published: false });
    try {
      const slug = r.code.toLowerCase();
      const hidden = await eventually(async () => (await fetch(`${WEB}/residences/${slug}`)).status === 404);
      expect(hidden, 'an unpublished residence must 404 for visitors').toBeTruthy();
      const { url } = await owner.post<{ url: string }>('/admin/preview', { path: `/residences/${slug}` });
      const token = new URL(url).searchParams.get('token')!;
      const api = await request.newContext();
      const res = await api.get(apiUrl(`/residences/${slug}`), { headers: { 'x-preview-token': token } });
      expect(res.status()).toBe(200);
      await api.dispose();
    } finally {
      await owner.patch(`/admin/residences/${r.id}`, { published: true });
    }
  });
});
