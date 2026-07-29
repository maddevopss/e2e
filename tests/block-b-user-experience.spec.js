const { test, expect } = require('@playwright/test');

const enabled = process.env.E2E_BLOCK_B_UX === '1';

test.describe('Bloc B — expérience utilisateur', () => {
  test.skip(!enabled, 'Activer avec E2E_BLOCK_B_UX=1 sur un environnement isolé.');

  test('navigation, clavier, mobile, états et reprise', async ({ page }) => {
    await page.goto(process.env.E2E_BASE_URL || '/');
    await expect(page.locator('main, [role="main"]').first()).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBeFalsy();

    await page.reload();
    await expect(page.locator('body')).not.toContainText(/application error|white screen/i);
  });
});
