const { expect } = require('@playwright/test');

function getCredentials() {
  return {
    email: process.env.TEST_ADMIN_EMAIL || process.env.E2E_ADMIN_EMAIL || process.env.TEST_USER_EMAIL,
    password: process.env.TEST_PASSWORD || process.env.E2E_PASSWORD || process.env.TEST_USER_PASSWORD
  };
}

async function login(page) {
  const { email, password } = getCredentials();

  if (!email || !password) {
    throw new Error('Missing E2E test credentials. Set TEST_ADMIN_EMAIL and TEST_PASSWORD in .env.');
  }

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await expect(page.locator('body')).not.toContainText(/unauthorized|invalid/i);
}

async function getToken(page) {
  const cookies = await page.context().cookies();
  return cookies.find((cookie) => ['access_token', 'jwt', 'token'].includes(cookie.name))?.value;
}

async function apiLogin() {
  throw new Error('apiLogin is disabled in E2E helpers. Prefer UI auth and storageState.');
}

module.exports = { login, apiLogin, getToken };
