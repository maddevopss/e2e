const { expect } = require('@playwright/test');
const { json } = require('./auth');

async function signupAndCompleteOnboardingUi(page, account) {
  await page.goto('/signup');
  await page.locator('[name="organisation_nom"]').fill(account.organisation);
  await page.locator('[name="user_nom"]').fill(account.user);
  await page.locator('[name="email"]').fill(account.email);
  await page.locator('[name="password"]').fill(account.password);

  const signupResponsePromise = page.waitForResponse((response) =>
    response.request().method() === 'POST' && /signup|register/i.test(response.url())
  );

  await page.locator('button[type="submit"]').click();
  await json(await signupResponsePromise, 'Inscription par interface');

  await expect(page).toHaveURL(/\/onboarding(?:[/?#]|$)/i, { timeout: 10_000 });
  await page.getByPlaceholder(/Acme Corp/i).fill(account.organisation);
  await page.getByPlaceholder(/123 Rue Principale/i).fill(
    account.address || '123 rue Test, Montréal, QC'
  );
  await page.getByRole('button', { name: /^Continuer$/i }).click();

  await expect(page.getByRole('heading', { name: /Étape 2.*Taxes/i })).toBeVisible();
  await page.getByRole('button', { name: /^Continuer$/i }).click();
  await expect(page.getByRole('heading', { name: /Étape 3/i })).toBeVisible();

  const setupResponsePromise = page.waitForResponse((response) =>
    response.request().method() === 'POST' && /\/onboarding\/setup(?:[/?#]|$)/i.test(response.url())
  );

  await page.getByRole('button', { name: /Passer et aller au Dashboard/i }).click();
  await json(await setupResponsePromise, 'Onboarding par interface');

  await expect(page).toHaveURL(/\/dashboard(?:[/?#]|$)/i, { timeout: 10_000 });
  await expect(page.getByRole('button', { name: /Déconnexion|Logout/i })).toBeVisible();
}

// La page /login (Login.jsx) n'a pas d'attributs name/placeholder sur ses champs
// (contrairement à /signup) : on cible par type. Elle ne passe pas par l'enveloppe
// {success,code,data} habituelle pour le corps de réponse, donc pas de helper json().
async function loginUi(page, { email, password }) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);

  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === 'POST' && /\/login(?:[/?#]|$)/i.test(response.url())
  );
  await page.getByRole('button', { name: /Se connecter/i }).click();
  await responsePromise;

  await expect(page).toHaveURL(/\/dashboard(?:[/?#]|$)/i, { timeout: 10_000 });
}

module.exports = { signupAndCompleteOnboardingUi, loginUi };
