const { test, expect } = require('@playwright/test');
const { unique } = require('./helpers/auth');
const { signupAndCompleteOnboardingUi } = require('./helpers/onboarding-ui');

test.describe('Parcours authentifié critique', () => {
  test('inscription → onboarding → session persistante → déconnexion → isolation multi-tenant', async ({ page, browser }) => {
    const password = 'TestPassword123!';
    const tenantA = {
      organisation: unique('Organisation-A'),
      user: 'Utilisateur Test A',
      email: `${unique('e2e-a')}@example.com`,
      password,
    };

    console.log('Step 1: Signup and complete onboarding for Tenant A');
    await signupAndCompleteOnboardingUi(page, tenantA);
    console.log('✓ Tenant A onboarding completed');

    console.log('Step 2: Verify authenticated session survives reload');
    await page.goto('/clients');
    await expect(page).toHaveURL(/\/clients(?:[/?#]|$)/i, { timeout: 10_000 });
    await page.reload();
    await expect(page).toHaveURL(/\/clients(?:[/?#]|$)/i, { timeout: 10_000 });
    await expect(page).not.toHaveURL(/\/(login|signup|onboarding)(?:[/?#]|$)/i);
    await expect(page.getByRole('button', { name: /Déconnexion|Logout/i })).toBeVisible();
    console.log('✓ Tenant A session persisted');

    console.log('Step 3: Logout Tenant A');
    await Promise.all([
      page.waitForURL(/\/login(?:[/?#]|$)/i, { timeout: 10_000 }),
      page.getByRole('button', { name: /Déconnexion|Logout/i }).click(),
    ]);
    await expect(page).toHaveURL(/\/login(?:[/?#]|$)/i);
    console.log('✓ Tenant A logout completed');

    console.log('Step 4: Signup and complete onboarding for Tenant B');
    const tenantBContext = await browser.newContext();
    const tenantBPage = await tenantBContext.newPage();
    const tenantB = {
      organisation: unique('Organisation-B'),
      user: 'Utilisateur Test B',
      email: `${unique('e2e-b')}@example.com`,
      password,
    };

    await signupAndCompleteOnboardingUi(tenantBPage, tenantB);
    console.log('✓ Tenant B onboarding completed');

    console.log('Step 5: Verify Tenant B cannot see Tenant A identity');
    await expect(tenantBPage.locator('body')).not.toContainText(tenantA.organisation);
    await expect(tenantBPage.locator('body')).not.toContainText(tenantA.email);

    await tenantBPage.goto('/clients');
    await expect(tenantBPage).toHaveURL(/\/clients(?:[/?#]|$)/i, { timeout: 10_000 });
    await expect(tenantBPage.locator('body')).not.toContainText(tenantA.organisation);
    await expect(tenantBPage.locator('body')).not.toContainText(tenantA.email);
    console.log('✓ Multi-tenant identity isolation verified');

    await tenantBContext.close();
  });
});
