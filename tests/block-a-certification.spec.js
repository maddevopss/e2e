const { test, expect } = require('@playwright/test');

const enabled = process.env.E2E_BLOCK_A_CERTIFICATION === '1';

test.describe('Bloc A — certification transversale', () => {
  test.skip(!enabled, 'Activer avec E2E_BLOCK_A_CERTIFICATION=1 sur un environnement isolé.');

  test('certifie santé, permissions, mobile, accessibilité et reprise', async ({ page, request }) => {
    const apiBase = process.env.E2E_API_URL || process.env.API_URL || 'http://127.0.0.1:3000';
    const health = await request.get(`${apiBase}/health`);
    expect(health.ok()).toBeTruthy();

    await page.goto('/dashboard');
    await expect(page).not.toHaveURL(/login/);
    await expect(page.locator('main, [role="main"]').first()).toBeVisible();

    const firstInteractive = page.locator('button, a, input, select, textarea').first();
    await firstInteractive.focus();
    await expect(firstInteractive).toBeFocused();

    await page.setViewportSize({ width: 390, height: 844 });
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(horizontalOverflow).toBeFalsy();

    await page.reload();
    await expect(page).not.toHaveURL(/login/);
    await expect(page.locator('main, [role="main"]').first()).toBeVisible();
  });
});
