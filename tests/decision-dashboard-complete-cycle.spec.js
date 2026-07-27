const { test, expect } = require('@playwright/test');

test('tableau de bord décisionnel complet', async ({ page }) => {
  test.skip(!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_PASSWORD, 'Identifiants E2E absents');
  await page.goto('/login');
  await page.getByLabel(/courriel|email/i).fill(process.env.E2E_ADMIN_EMAIL);
  await page.getByLabel(/mot de passe/i).fill(process.env.E2E_PASSWORD);
  await page.getByRole('button', { name: /connexion|se connecter/i }).click();
  await page.goto('/dashboard');
  await expect(page.getByText(/revenu|trésorerie|inventaire|fournisseur/i).first()).toBeVisible();
  await expect(page.getByText(/alerte|risque|santé/i).first()).toBeVisible();
});
