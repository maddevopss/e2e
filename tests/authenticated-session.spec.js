const { test, expect } = require('@playwright/test');
const path = require('path');

const authFile = path.resolve(
  process.cwd(),
  process.env.E2E_AUTH_FILE || 'storageState/auth.json'
);

test.use({ storageState: authFile });

test('authenticated session reaches a protected page', async ({ page }) => {
  await page.goto('/dashboard');

  await expect(page).not.toHaveURL(/\/login(?:[/?#]|$)/i);
  await expect(page.locator('body')).toBeVisible();

  const main = page.locator('main, [role="main"]').first();
  await expect(main.or(page.locator('body'))).toBeVisible();
});

test('authenticated session remains usable after reload', async ({ page }) => {
  await page.goto('/dashboard');
  await page.reload();

  await expect(page).not.toHaveURL(/\/login(?:[/?#]|$)/i);
  await expect(page.locator('body')).toBeVisible();
});
