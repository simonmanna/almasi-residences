import { expect, test } from '@playwright/test';

test.describe('buyer shortlist', () => {
  test('D1. list rows carry no Save or Compare button', async ({ page }) => {
    await page.goto('/residences');

    // A row is a way into a residence and a way into its 3D tour — not a
    // shortlist. The per-row Save and Compare buttons were removed.
    await expect(page.getByRole('link', { name: 'View', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Compare', exact: true })).toHaveCount(0);
  });

  test('D1. a favourite saved on a residence page persists', async ({ page }) => {
    await page.goto('/residences');
    await page.getByRole('link', { name: 'View', exact: true }).first().click();
    await expect(page).toHaveURL(/\/residences\/[^/]+$/);

    // Saving still lives on the residence's own page, and survives a reload.
    const save = page.getByRole('button', { name: 'Save residence', exact: true });
    await expect(save).toBeVisible();
    await save.click();
    const saved = page.getByRole('button', { name: 'Saved to favourites', exact: true });
    await expect(saved).toBeVisible();

    await page.reload();
    await expect(saved).toBeVisible();
  });
});
