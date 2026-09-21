import { expect, test } from '@playwright/test';

test.describe('buyer shortlist', () => {
  test('D1. favourites persist and two residences can be compared', async ({ page }) => {
    await page.goto('/residences');

    const save = page.getByRole('button', { name: 'Save', exact: true }).first();
    await expect(save).toBeVisible();
    await save.click();
    await expect(page.getByRole('button', { name: 'Saved', exact: true }).first()).toBeVisible();

    const compare = page.getByRole('button', { name: 'Compare', exact: true });
    await expect(compare).toHaveCount(await page.locator('tbody tr').filter({ has: page.getByRole('link', { name: 'View', exact: true }) }).count());
    await compare.nth(0).click();
    await compare.nth(0).click();
    await expect(page.getByRole('heading', { name: 'Compare residences' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('button', { name: 'Saved', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Compare residences' })).toBeVisible();
  });
});
