const { expect } = require('@playwright/test');

function credentials() {
  return {
    email: process.env.TEST_ADMIN_EMAIL || process.env.E2E_ADMIN_EMAIL || process.env.TEST_USER_EMAIL,
    pass: process.env.TEST_PASSWORD || process.env.E2E_PASSWORD || process.env.TEST_USER_PASSWORD
  };
}

async function fillFirst(page, selectors, value) {
  for (const selector of selectors) {
    const element = page.locator(selector).first();
    if (await element.count()) {
      try {
        await element.fill(value, { timeout: 2000 });
        return true;
      } catch (_) {}
    }
  }
  return false;
}

async function clickFirst(page, selectors) {
  for (const selector of selectors) {
    const element = page.locator(selector).first();
    if (await element.count()) {
      try {
        await element.click({ timeout: 2000 });
        return true;
      } catch (_) {}
    }
  }
  return false;
}

async function loginWithUi(page) {
  const data = credentials();

  if (!data.email || !data.pass) {
    throw new Error('Missing E2E credentials. Set TEST_ADMIN_EMAIL/TEST_PASSWORD locally or E2E_ADMIN_EMAIL/E2E_PASSWORD in CI.');
  }

  await page.goto('/login', { waitUntil: 'domcontentloaded' });

  const emailOk = await fillFirst(page, [
    'input[name="email"]',
    'input[type="email"]',
    'input[autocomplete="email"]',
    'input[placeholder*="email" i]',
    'input[placeholder*="courriel" i]'
  ], data.email);

  const passOk = await fillFirst(page, [
    'input[name="password"]',
    'input[type="password"]',
    'input[autocomplete="current-password"]',
    'input[placeholder*="password" i]',
    'input[placeholder*="mot de passe" i]'
  ], data.pass);

  if (!emailOk || !passOk) {
    throw new Error('Login fields not found.');
  }

  const submitOk = await clickFirst(page, [
    'button[type="submit"]',
    'button:has-text("Connexion")',
    'button:has-text("Se connecter")',
    'button:has-text("Login")',
    'button:has-text("Sign in")'
  ]);

  if (!submitOk) {
    throw new Error('Login submit button not found.');
  }

  await page.waitForLoadState('networkidle').catch(() => {});
  await expect(page.locator('body')).not.toContainText(/unauthorized|invalid/i);
}

module.exports = { loginWithUi };
