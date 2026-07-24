const { test, expect } = require('@playwright/test');

const apiUrl = process.env.TEST_API_URL || 'http://127.0.0.1:5000/api';

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function accessToken(body) {
  return body?.data?.token ?? body?.data?.access_token ?? body?.data?.accessToken ??
    body?.token ?? body?.access_token ?? body?.accessToken;
}

async function json(response, label) {
  const text = await response.text();
  expect(response.ok(), `${label}: ${response.status()} ${text}`).toBeTruthy();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} doit retourner du JSON. Corps reçu: ${text}`);
  }
}

test.describe('Stabilité onboarding E2E', () => {
  test('configure explicitement l’organisation avant les navigations protégées', async ({ page }) => {
    const organisation = unique('Organisation-onboarding-E2E');

    await page.goto('/signup');
    await page.locator('[name="organisation_nom"]').fill(organisation);
    await page.locator('[name="user_nom"]').fill('Administrateur Onboarding E2E');
    await page.locator('[name="email"]').fill(`${unique('onboarding-admin')}@example.com`);
    await page.locator('[name="password"]').fill('TestPassword123!');

    const signupPromise = page.waitForResponse((response) =>
      response.request().method() === 'POST' && /signup|register/i.test(response.url())
    );
    await page.locator('button[type="submit"]').click();

    const signupBody = await json(await signupPromise, 'Inscription');
    const token = accessToken(signupBody);
    expect(token, 'Un jeton d’accès réel est requis').toBeTruthy();

    const setup = await page.request.post(`${apiUrl}/onboarding/setup`, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      data: {
        nom: organisation,
        address: '123 rue de la Preuve, Montréal, QC',
        taxNumbers: '',
      },
    });
    await json(setup, 'Configuration onboarding');

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard(?:[/?#]|$)/i, { timeout: 15_000 });
    await expect(page.locator('body')).not.toContainText('Étape 1 : Votre Entreprise');

    await page.goto('/estimates');
    await expect(page).toHaveURL(/\/estimates(?:[/?#]|$)/i, { timeout: 15_000 });
    await expect(page.locator('body')).not.toContainText('Étape 1 : Votre Entreprise');
  });
});
