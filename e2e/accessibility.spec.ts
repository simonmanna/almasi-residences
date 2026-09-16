import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * The audit found a site that was careful about accessibility by hand and had
 * nothing checking it. These are the pages a buyer actually walks through; a
 * regression on any of them is a regression in the sale.
 *
 * Scoped to WCAG 2.1 A and AA. Colour-contrast is included deliberately — the
 * palette is authored by hand and tokens.contrast.test.ts only proves the
 * tokens are sound, not that a component used the right pair.
 */
const PAGES = [
  { path: '/', name: 'home' },
  { path: '/residences', name: 'residences' },
  { path: '/amenities', name: 'amenities' },
  { path: '/location', name: 'location' },
  { path: '/gallery', name: 'gallery' },
  { path: '/buying', name: 'buying' },
  { path: '/enquire', name: 'enquire' },
  { path: '/privacy', name: 'privacy' },
  { path: '/terms', name: 'terms' },
];

const scan = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // The 3D maquette is a canvas with a documented keyboard and list
    // alternative beside it; axe cannot see inside it.
    .exclude('[role="application"]')
    // Incidental text under WCAG 1.4.3 — decoration that repeats information
    // already given in real text. Nothing that informs may carry this.
    .exclude('[data-decorative="true"]')
    .analyze();

test.describe('accessibility', () => {
  for (const { path, name } of PAGES) {
    test(`${name} has no WCAG A or AA violations`, async ({ page }) => {
      // networkidle never arrives in dev — the HMR socket stays open.
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      const results = await scan(page);
      expect(
        results.violations.map((v) => `${v.id} (${v.nodes.length}) — ${v.help}`),
        `${name} has accessibility violations`,
      ).toEqual([]);
    });
  }

  test('a residence page has no WCAG A or AA violations', async ({ page }) => {
    await page.goto('/residences');
    const first = page.locator('a[href^="/residences/"]').first();
    await expect(first).toBeVisible();
    await first.click();
    await page.waitForURL(/\/residences\/.+/);
    await page.waitForTimeout(1500);
    const results = await scan(page);
    expect(results.violations.map((v) => `${v.id} — ${v.help}`)).toEqual([]);
  });

  test('the enquiry sheet traps focus and is reachable by keyboard', async ({ page }) => {
    await page.goto('/residences');
    await page.getByRole('button', { name: /^enquire$/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const results = await scan(page);
    expect(results.violations.map((v) => `${v.id} — ${v.help}`)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
