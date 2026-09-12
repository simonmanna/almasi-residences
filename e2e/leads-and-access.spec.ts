import { expect, test } from '@playwright/test';
import { AdminApi, apiUrl, eventually, publicContext } from './admin-api';

/**
 * Journeys 6, 8 and 9 of the critical suite.
 *
 * 6 is the second loop — a customer's enquiry has to become a lead management
 * can see. 8 is the authorisation model, which the audit found open. 9 is the
 * behaviour of the chain when the website is not there to be told about a
 * change; it asserts the poll backstop rather than the revalidation call.
 */

test.describe('the lead loop and who may see what', () => {
  test('6. a public enquiry becomes a lead the sales team can open', async () => {
    const admin = await AdminApi.as('owner');
    const anon = await publicContext();

    const stamp = Date.now();
    const name = `E2E Buyer ${stamp}`;
    const email = `e2e-${stamp}@example.invalid`;

    try {
      const inventory = await anon.get(apiUrl('/development/almasi-residences/inventory'));
      const inv = (await inventory.json()) as {
        buildings: { floors: { units: { id: string; status: string }[] }[] }[];
      };
      const unit = inv.buildings
        .flatMap((b) => b.floors.flatMap((f) => f.units))
        .find((u) => u.status === 'AVAILABLE');
      expect(unit, 'no available unit to enquire about').toBeTruthy();

      // Exactly what the public form posts, including the honeypot field.
      const submitted = await anon.post(apiUrl('/enquiry'), {
        data: {
          name,
          email,
          phone: '+250788123456',
          message: 'Sent by the end-to-end suite.',
          intent: 'VIEWING',
          source: 'e2e',
          unitIds: [unit!.id],
          company: '',
        },
      });
      expect(submitted.ok(), `enquiry POST returned ${submitted.status()} ${await submitted.text()}`).toBeTruthy();
      const { id } = (await submitted.json()) as { id: string };
      expect(id).not.toEqual('discarded');

      // …and management can see it, with the residence attached.
      const lead = await admin.get<{ name: string; email: string; status: string; units: { id: string }[] }>(
        `/admin/enquiries/${id}`,
      );
      expect(lead.name).toBe(name);
      expect(lead.email).toBe(email);
      expect(lead.status).toBe('NEW');
      expect(lead.units.map((u) => u.id)).toContain(unit!.id);
    } finally {
      await anon.dispose();
      await admin.dispose();
    }
  });

  test('6b. the honeypot swallows a bot without persisting anything', async () => {
    const anon = await publicContext();
    try {
      const res = await anon.post(apiUrl('/enquiry'), {
        data: {
          name: 'Bot',
          email: 'bot@example.invalid',
          phone: '+250788123456',
          intent: 'INFORMATION',
          unitIds: [],
          company: 'filled in by a bot',
        },
      });
      expect(res.ok()).toBeTruthy();
      // A normal-looking success, so the bot learns nothing.
      expect(((await res.json()) as { id: string }).id).toBe('discarded');
    } finally {
      await anon.dispose();
    }
  });

  test('8. a viewer may browse but not export, administer or read private notes', async () => {
    const viewer = await AdminApi.as('viewer');
    try {
      expect(await viewer.status('/admin/residences?pageSize=1')).toBe(200);
      expect(await viewer.status('/admin/residences/export.csv')).toBe(403);
      expect(await viewer.status('/admin/users')).toBe(403);
      expect(await viewer.status('/admin/audit')).toBe(403);

      const page = await viewer.get<{ data: { id: string }[] }>('/admin/residences?pageSize=1');
      const detail = await viewer.get<{ notes: string | null }>(`/admin/residences/${page.data[0]!.id}`);
      expect(detail.notes, 'a viewer can read private notes').toBeNull();
    } finally {
      await viewer.dispose();
    }
  });

  test('8b. a mutating request without the CSRF token is refused', async () => {
    const admin = await AdminApi.as('sales');
    try {
      // Same session, same cookies, no `x-csrf-token`.
      const res = await admin.raw().post(apiUrl('/admin/auth/logout'));
      expect(res.status(), 'a mutation without the CSRF token should be refused').toBe(403);
    } finally {
      await admin.dispose();
    }
  });

  test('8c. signing out revokes the session rather than only clearing the cookie', async () => {
    const admin = await AdminApi.as('content');
    try {
      expect(await admin.status('/admin/me')).toBe(200);
      await admin.post('/admin/auth/logout');
      // The context still holds the cookie the browser was told to drop.
      expect(await admin.status('/admin/me'), 'a signed-out token still works').toBe(401);
    } finally {
      await admin.dispose();
    }
  });

  test('9. status reaches the site through the poll even if revalidation is not received', async () => {
    const admin = await AdminApi.as('property');
    const anon = await publicContext();
    try {
      const page = await admin.get<{ data: { id: string; code: string; status: string }[] }>(
        '/admin/residences?status=AVAILABLE&pageSize=1',
      );
      const row = page.data[0]!;

      await admin.post(`/admin/residences/${row.id}/status`, { status: 'RESERVED', note: 'end-to-end test' });
      try {
        // /inventory/live is `no-store` and is what every visitor's browser
        // polls; it is the backstop when a revalidation call is lost.
        const reserved = await eventually(
          async () => {
            const res = await anon.get(apiUrl('/inventory/live?development=almasi-residences'));
            const live = (await res.json()) as { units: { id: string; status: string }[] };
            return live.units.find((u) => u.id === row.id)?.status === 'RESERVED';
          },
          { timeout: 20000 },
        );
        expect(reserved, 'the live endpoint never reported the new status').toBeTruthy();
      } finally {
        await admin.post(`/admin/residences/${row.id}/status`, { status: row.status, note: 'restore' });
      }
    } finally {
      await anon.dispose();
      await admin.dispose();
    }
  });
});
