const { test, expect } = require('@playwright/test');
const { makeTestPassword } = require('./helpers/credentials');
const { signup, unique } = require('./helpers/auth');

test.describe('Stabilité onboarding E2E', () => {
  test('configure explicitement l’organisation avant les navigations protégées', async ({ page }) => {
    const organisation = unique('Organisation-onboarding-E2E');

    await signup(page, {
      organisation,
      user: 'Administrateur Onboarding E2E',
      email: `${unique('onboarding-admin')}@example.com`,
      password: makeTestPassword(),
    });

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard(?:[/?#]|$)/i, { timeout: 15_000 });
    await expect(page.locator('body')).not.toContainText('Étape 1 : Votre Entreprise');

    await page.goto('/estimates');
    await expect(page).toHaveURL(/\/estimates(?:[/?#]|$)/i, { timeout: 15_000 });
    await expect(page.locator('body')).not.toContainText('Étape 1 : Votre Entreprise');
  });
});
