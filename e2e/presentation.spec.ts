import { expect, test } from '@playwright/test';
import { AdminApi, eventually, publicJson, type ResidenceRow } from './admin-api';

const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const html = (path: string) => fetch(`${WEB}${path}`, { cache: 'no-store' }).then((r) => r.text());

/**
 * Roadmap phase 1: the presentation the website used to keep in its own
 * repository now comes from the admin. Each test changes one surface in the
 * admin and watches the rendered website follow — the three conditions §52
 * sets for every conversion.
 */
test.describe('presentation comes from the admin', () => {
  let api: AdminApi;

  test.beforeAll(async () => {
    api = await AdminApi.as('owner');
  });
  test.afterAll(async () => {
    await api.dispose();
  });

  test('P1. a placement change reaches the page that shows it, and an empty placement is a neutral frame', async () => {
    const slots = await api.get<{ key: string; image: { id: string; title: string | null } | null }[]>('/admin/slots');
    const hero = slots.find((s) => s.key === 'page-amenities')!;
    const original = hero.image?.id ?? null;
    try {
      await api.put('/admin/slots/page-amenities', { imageId: null });
      const neutral = await eventually(async () => (await html('/amenities')).includes('Amenities page header: image to follow'));
      expect(neutral, 'an empty placement should render the neutral frame, not a substitute').toBeTruthy();

      const pub = await publicJson<Record<string, { image: unknown }>>('/media-slots');
      expect(pub['page-amenities']!.image).toBeNull();
    } finally {
      await api.put('/admin/slots/page-amenities', { imageId: original });
    }
    const back = await eventually(async () => !(await html('/amenities')).includes('Amenities page header: image to follow'));
    expect(back).toBeTruthy();
  });

  test('P2. a specification row reaches every residence page', async () => {
    const page = await api.get<{ data: ResidenceRow[] }>('/admin/residences?status=AVAILABLE&pageSize=5');
    const r = page.data.find((x) => x.published)!;
    const value = `E2E specification ${Date.now()}`;
    const row = await api.post<{ id: string }>('/admin/specifications', { label: `E2E ${Date.now()}`, value });
    try {
      const shown = await eventually(async () => (await html(`/residences/${r.code.toLowerCase()}`)).includes(value));
      expect(shown, 'the specification row never reached the residence page').toBeTruthy();
    } finally {
      await api.del(`/admin/specifications/${row.id}`);
    }
  });

  test('P3. a walkthrough station edit reaches the tour', async () => {
    const tours = await api.get<{ id: string; slug: string }[]>('/admin/tours');
    const tour = tours.find((t) => t.slug === 'building')!;
    const detail = await api.get<{ scenes: { id: string; body: string | null }[] }>(`/admin/tours/${tour.id}`);
    const scene = detail.scenes[0]!;
    const body = `E2E station text ${Date.now()}`;
    await api.patch(`/admin/tours/${tour.id}/scenes/${scene.id}`, { body });
    try {
      const shown = await eventually(async () => (await html('/tour')).includes(body));
      expect(shown, 'the station text never reached /tour').toBeTruthy();
    } finally {
      await api.patch(`/admin/tours/${tour.id}/scenes/${scene.id}`, { body: scene.body });
    }
  });

  test('P4. a route description written in the admin becomes the page meta description', async () => {
    const description = `E2E description for the location page ${Date.now()}`;
    await api.put('/admin/seo/pages', { path: '/location', description });
    try {
      const shown = await eventually(async () => (await html('/location')).includes(`<meta name="description" content="${description}"`));
      expect(shown, 'the SEO description never reached the <meta> tag').toBeTruthy();
    } finally {
      await api.put('/admin/seo/pages', { path: '/location', description: null });
    }
  });

  test('P5. page copy has no fallback in code: an emptied field renders nothing', async () => {
    const before = await api.get<{ content: Record<string, unknown> }>('/admin/pages/location');
    const lede = before.content.heroLede as string;
    await api.put('/admin/pages/location', { content: { heroLede: '' }, publish: true });
    try {
      const gone = await eventually(async () => !(await html('/location')).includes(lede.slice(0, 40)));
      expect(gone, 'the old sentence is still printed after the field was emptied').toBeTruthy();
    } finally {
      await api.put('/admin/pages/location', { content: { heroLede: lede }, publish: true });
    }
  });

  test('P6. choosing a 3D position places a residence the model could not', async () => {
    const page = await api.get<{ data: ResidenceRow[] }>('/admin/residences?status=AVAILABLE&pageSize=50');
    const seed = page.data.find((x) => x.published && x.floor.level >= 1 && x.floor.level <= 3)!;
    const created = await api.post<{ id: string }>('/admin/residences', {
      code: `Q${Date.now().toString().slice(-4)}`,
      floorId: seed.floorId,
      typologyId: seed.typologyId,
      priceMinor: 15000000,
      bedrooms: 1,
      bathrooms: 1,
      areaSqm: 70,
      orientation: 'N',
    });
    try {
      expect((await api.get<{ placedInModel: boolean }>(`/admin/residences/${created.id}`)).placedInModel).toBe(false);
      await api.patch(`/admin/residences/${created.id}`, { modelSlot: 'E' });
      expect((await api.get<{ placedInModel: boolean }>(`/admin/residences/${created.id}`)).placedInModel).toBe(true);
    } finally {
      await api.post(`/admin/residences/${created.id}/archive`);
      await api.del(`/admin/residences/${created.id}`);
    }
  });
});
