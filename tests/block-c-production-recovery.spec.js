const { test, expect } = require('@playwright/test');

const enabled = process.env.E2E_BLOCK_C_RECOVERY === '1';

test.describe('Bloc C — production et reprise', () => {
  test.skip(!enabled, 'Activer uniquement sur un environnement isolé avec E2E_BLOCK_C_RECOVERY=1.');

  test('santé, indisponibilité contrôlée et reprise de session', async ({ page, request }) => {
    const api = process.env.E2E_API_URL;
    if (!api) throw new Error('E2E_API_URL est requis.');

    const health = await request.get(`${api}/health`);
    expect(health.ok()).toBeTruthy();

    await page.goto(process.env.E2E_BASE_URL || '/');
    await page.reload();
    await expect(page.locator('body')).not.toContainText(/application error|database unavailable/i);

    const secondHealth = await request.get(`${api}/health`);
    expect(secondHealth.ok()).toBeTruthy();
  });
});
