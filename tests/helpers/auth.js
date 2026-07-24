const { expect } = require('@playwright/test');

const apiUrl = process.env.TEST_API_URL || 'http://127.0.0.1:5000/api';

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function accessToken(body) {
  return body?.data?.token ?? body?.data?.access_token ?? body?.data?.accessToken ??
    body?.token ?? body?.access_token ?? body?.accessToken;
}

function entity(body, key) {
  return body?.data?.[key] ?? body?.[key] ?? body?.data ?? body;
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

async function signup(page, account, { completeOnboarding = true } = {}) {
  await page.goto('/signup');
  await page.locator('[name="organisation_nom"]').fill(account.organisation);
  await page.locator('[name="user_nom"]').fill(account.user);
  await page.locator('[name="email"]').fill(account.email);
  await page.locator('[name="password"]').fill(account.password);

  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === 'POST' && /signup|register/i.test(response.url())
  );
  await page.locator('button[type="submit"]').click();

  const body = await json(await responsePromise, 'Inscription');
  const token = accessToken(body);
  expect(token, 'Un jeton d’accès réel est requis').toBeTruthy();
  await expect(page).toHaveURL(/\/(onboarding|dashboard)(?:[/?#]|$)/i, { timeout: 15_000 });

  const authorization = `Bearer ${token}`;
  if (completeOnboarding) {
    const setup = await page.request.post(`${apiUrl}/onboarding/setup`, {
      headers: {
        accept: 'application/json',
        authorization,
        'content-type': 'application/json',
      },
      data: {
        nom: account.organisation,
        address: account.address || '123 rue de la Preuve, Montréal, QC',
        taxNumbers: account.taxNumbers || '',
      },
    });
    await json(setup, 'Configuration onboarding');
  }

  return authorization;
}

async function apiRequest(context, authorization, method, path, data) {
  const response = await context.request.fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      authorization,
      ...(data ? { 'content-type': 'application/json' } : {}),
    },
    ...(data ? { data } : {}),
  });
  return { response, body: await json(response, `${method} ${path}`) };
}

module.exports = {
  apiUrl,
  apiRequest,
  entity,
  json,
  signup,
  unique,
};
