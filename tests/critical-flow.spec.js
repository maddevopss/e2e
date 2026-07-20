const { test, expect } = require('@playwright/test');

async function signupAndCompleteOnboarding(page, { organisation, userName, email, password }) {
  await page.goto('/signup');

  await page.locator('[name="organisation_nom"]').fill(organisation);
  await page.locator('[name="user_nom"]').fill(userName);
  await page.locator('[name="email"]').fill(email);
  await page.locator('[name="password"]').fill(password);

  const signupResponsePromise = page.waitForResponse((response) =>
    response.request().method() === 'POST' && /signup|register/i.test(response.url())
  );

  await page.locator('button[type="submit"]').click();

  const signupResponse = await signupResponsePromise;
  const signupBody = await signupResponse.text();
  expect(
    signupResponse.ok(),
    `Signup failed: ${signupResponse.status()} ${signupBody}`
  ).toBeTruthy();

  await expect(page).toHaveURL(/\/onboarding(?:[/?#]|$)/i, { timeout: 10_000 });

  await page.getByPlaceholder(/Acme Corp/i).fill(organisation);
  await page.getByPlaceholder(/123 Rue Principale/i).fill('123 rue Test, Montréal, QC');
  await page.getByRole('button', { name: /^Continuer$/i }).click();

  await expect(page.getByRole('heading', { name: /Étape 2.*Taxes/i })).toBeVisible();
  await page.getByRole('button', { name: /^Continuer$/i }).click();

  await expect(page.getByRole('heading', { name: /Étape 3/i })).toBeVisible();

  const setupResponsePromise = page.waitForResponse((response) =>
    response.request().method() === 'POST' && /\/onboarding\/setup(?:[/?#]|$)/i.test(response.url())
  );

  await page.getByRole('button', { name: /Passer et aller au Dashboard/i }).click();

  const setupResponse = await setupResponsePromise;
  const setupBody = await setupResponse.text();
  expect(
    setupResponse.ok(),
    `Onboarding failed: ${setupResponse.status()} ${setupBody}`
  ).toBeTruthy();

  await expect(page).toHaveURL(/\/dashboard(?:[/?#]|$)/i, { timeout: 10_000 });
  await expect(page.getByRole('button', { name: /Déconnexion|Logout/i })).toBeVisible();
}

test.describe('Critical authenticated flow', () => {
  test('signup → onboarding → persistent session → logout → multi-tenant isolation', async ({ page, browser }) => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 11);
    const password = 'TestPassword123!';

    const tenantA = {
      organisation: `Organisation A ${timestamp}`,
      userName: 'Utilisateur Test A',
      email: `e2e-a-${timestamp}-${random}@example.com`,
      password,
    };

    console.log('Step 1: Signup and complete onboarding for Tenant A');
    await signupAndCompleteOnboarding(page, tenantA);
    console.log('✓ Tenant A onboarding completed');

    console.log('Step 2: Verify authenticated session survives reload');
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard(?:[/?#]|$)/i, { timeout: 10_000 });
    await expect(page.getByRole('button', { name: /Déconnexion|Logout/i })).toBeVisible();
    console.log('✓ Tenant A session persisted');

    console.log('Step 3: Logout Tenant A');
    const logoutButton = page.getByRole('button', { name: /Déconnexion|Logout/i });
    await Promise.all([
      page.waitForURL(/\/login(?:[/?#]|$)/i, { timeout: 10_000 }),
      logoutButton.click(),
    ]);
    await expect(page).toHaveURL(/\/login(?:[/?#]|$)/i);
    console.log('✓ Tenant A logout completed');

    console.log('Step 4: Signup and complete onboarding for Tenant B');
    const tenantBContext = await browser.newContext();
    const tenantBPage = await tenantBContext.newPage();

    const tenantB = {
      organisation: `Organisation B ${timestamp}`,
      userName: 'Utilisateur Test B',
      email: `e2e-b-${timestamp}-${random}@example.com`,
      password,
    };

    await signupAndCompleteOnboarding(tenantBPage, tenantB);
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
