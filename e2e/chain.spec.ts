import { expect, test } from '@playwright/test';
import { AdminApi, eventually, publicJson, type ResidenceRow } from './admin-api';

/**
 * The chain this whole platform rests on: a change made in the admin has to
 * arrive on the public website.
 *
 * These are the tests that make roadmap gate 1 verifiable. Each turns a claim
 * from the audit — "the admin database is the single source of truth" — into
 * something that fails loudly when it stops being true.
 */

interface Inventory {
  currency: string;
  buildings: { floors: { level: number; units: { id: string; code: string; status: string; priceMinor: number }[] }[] }[];
}

const unitsOf = (inv: Inventory) => inv.buildings.flatMap((b) => b.floors.flatMap((f) => f.units));

/**
 * Deleting a residence is deliberately hard: it has to be archived first, and
 * anything with a sale, an enquiry or a resident on record stays archived
 * forever. Test fixtures have none of that, so archive-then-delete is the
 * correct teardown rather than a workaround.
 */
async function discard(api: AdminApi, id: string): Promise<void> {
  await api.post(`/admin/residences/${id}/archive`);
  await api.del(`/admin/residences/${id}`);
}

/** A published, available residence to work against, restored afterwards. */
async function scratchResidence(api: AdminApi): Promise<ResidenceRow> {
  const page = await api.get<{ data: ResidenceRow[] }>('/admin/residences?status=AVAILABLE&pageSize=50');
  const row = page.data.find((r) => r.published && r.status === 'AVAILABLE');
  expect(row, 'the seed has no published available residence to test with').toBeTruthy();
  return row!;
}

test.describe('admin to website', () => {
  let api: AdminApi;

  test.beforeAll(async () => {
    api = await AdminApi.as('owner');
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('1. a new residence reaches the public inventory and its own page', async ({ page }) => {
    const seed = await scratchResidence(api);
    const code = `E2E${Date.now().toString().slice(-5)}`;

    const created = await api.post<{ id: string }>('/admin/residences', {
      code,
      floorId: seed.floorId,
      typologyId: seed.typologyId,
      priceMinor: 19900000,
      bedrooms: 2,
      bathrooms: 2,
      areaSqm: 101.5,
      orientation: 'S',
      published: true,
      status: 'AVAILABLE',
    });

    try {
      const inv = await publicJson<Inventory>('/development/almasi-residences/inventory');
      expect(unitsOf(inv).map((u) => u.code)).toContain(code);

      const slug = code.toLowerCase();
      const arrived = await eventually(async () => {
        const res = await page.goto(`/residences/${slug}`, { waitUntil: 'domcontentloaded' });
        return res?.status() === 200;
      });
      expect(arrived, `/residences/${slug} never rendered`).toBeTruthy();
    } finally {
      await discard(api, created.id);
    }
  });

  test('2. an edited description reaches the residence page', async ({ page }) => {
    const row = await scratchResidence(api);
    const before = await api.get<{ description: string | null }>(`/admin/residences/${row.id}`);
    const text = `Checked end to end at ${new Date().toISOString()}`;

    // `description` is the field the page renders; `shortDescription` only
    // reaches the meta tag, so editing that would not prove anything visible.
    await api.patch(`/admin/residences/${row.id}`, { description: text });
    try {
      const inApi = await eventually(async () => {
        const pub = await publicJson<{ description: string | null }>(`/residences/${row.code.toLowerCase()}`);
        return pub.description === text;
      });
      expect(inApi, 'the API never returned the new description').toBeTruthy();

      const onPage = await eventually(async () => {
        await page.goto(`/residences/${row.code.toLowerCase()}`, { waitUntil: 'domcontentloaded' });
        return (await page.locator('body').innerText()).includes(text);
      }, { timeout: 90000 });
      expect(onPage, 'the new description never appeared on the residence page').toBeTruthy();
    } finally {
      await api.patch(`/admin/residences/${row.id}`, { description: before.description ?? '' });
    }
  });

  test('3. a price change reaches the live endpoint the site polls', async () => {
    const row = await scratchResidence(api);
    const next = row.priceMinor + 700000;

    await api.post(`/admin/residences/${row.id}/price`, { priceMinor: next, reason: 'end-to-end test' });
    try {
      const live = await eventually(
        async () => {
          const inv = await publicJson<{ units: { id: string; priceMinor: number }[] }>(
            '/inventory/live?development=almasi-residences',
          );
          return inv.units.find((u) => u.id === row.id)?.priceMinor === next;
        },
        { timeout: 20000 },
      );
      expect(live, 'the live endpoint never reported the new price').toBeTruthy();
    } finally {
      await api.post(`/admin/residences/${row.id}/price`, { priceMinor: row.priceMinor, reason: 'restore' });
    }
  });

  test('4. a sold residence reads as sold and stops showing a price', async () => {
    const row = await scratchResidence(api);

    await api.post(`/admin/residences/${row.id}/status`, { status: 'SOLD', note: 'end-to-end test' });
    try {
      const sold = await eventually(
        async () => {
          const res = await publicJson<{ status: string; priceMinor: number | null }>(
            `/residences/${row.code.toLowerCase()}`,
          );
          return res.status === 'sold' && res.priceMinor === null;
        },
        { timeout: 20000 },
      );
      expect(sold, 'the public residence never read as sold with no price').toBeTruthy();
    } finally {
      await api.post(`/admin/residences/${row.id}/status`, { status: 'AVAILABLE', note: 'restore' });
    }
  });

  test('5. unpublishing removes a residence from the inventory and the sitemap', async ({ page }) => {
    const row = await scratchResidence(api);
    const slug = row.code.toLowerCase();

    await api.patch(`/admin/residences/${row.id}`, { published: false });
    try {
      const gone = await eventually(
        async () => {
          const inv = await publicJson<Inventory>('/development/almasi-residences/inventory');
          return !unitsOf(inv).some((u) => u.id === row.id);
        },
        { timeout: 20000 },
      );
      expect(gone, 'an unpublished residence is still in the public inventory').toBeTruthy();

      const removed = await eventually(
        async () => {
          const xml = await (await page.request.get('/sitemap.xml')).text();
          return !xml.includes(`/residences/${slug}`);
        },
        { timeout: 30000 },
      );
      expect(removed, 'an unpublished residence is still in the sitemap').toBeTruthy();
    } finally {
      await api.patch(`/admin/residences/${row.id}`, { published: true });
    }
  });

  test('7. an uploaded photograph reaches the residence the website serves', async () => {
    const row = await scratchResidence(api);
    const alt = `End-to-end test image ${Date.now()}`;

    // A one-pixel PNG is enough: the assertion is that the library reaches the
    // public residence, not that the picture is any good.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const res = await api.raw().post(api.apiUrl('/admin/assets/upload'), {
      headers: api.headers,
      multipart: {
        collection: 'LIBRARY',
        category: 'INTERIOR',
        unitId: row.id,
        altText: alt,
        file: { name: 'e2e.png', mimeType: 'image/png', buffer: png },
      },
    });
    expect(res.ok(), `upload returned ${res.status()}`).toBeTruthy();
    const [asset] = (await res.json()) as { id: string }[];

    try {
      // A residence with its own photographs shows those *instead of* the ones
      // shared by its type, so the count can go down. Identity is the assertion.
      const appeared = await eventually(
        async () => {
          const after = await publicJson<{ images: { altText: string | null }[] }>(
            `/residences/${row.code.toLowerCase()}`,
          );
          return after.images.some((m) => m.altText === alt);
        },
        { timeout: 30000 },
      );
      expect(appeared, 'the uploaded photograph never reached the public residence').toBeTruthy();
    } finally {
      await api.del(`/admin/assets/${asset!.id}`);
    }
  });

  test('10. a residence the 3D model cannot place is flagged, not dropped', async () => {
    const seed = await scratchResidence(api);
    const code = `Z${Date.now().toString().slice(-4)}`;

    const created = await api.post<{ id: string }>('/admin/residences', {
      code,
      floorId: seed.floorId,
      typologyId: seed.typologyId,
      priceMinor: 15000000,
      bedrooms: 1,
      bathrooms: 1,
      areaSqm: 70,
      orientation: 'N',
      published: true,
      status: 'AVAILABLE',
    });

    try {
      const detail = await api.get<{ placedInModel: boolean }>(`/admin/residences/${created.id}`);
      expect(detail.placedInModel, `${code} should be flagged as unplaceable in the maquette`).toBe(false);

      // ...and it is still for sale everywhere else.
      const inv = await publicJson<Inventory>('/development/almasi-residences/inventory');
      expect(unitsOf(inv).map((u) => u.code)).toContain(code);
    } finally {
      await discard(api, created.id);
    }
  });
});
