const { expect } = require('@playwright/test');

function credentials() {
  return {
    email:
      process.env.TEST_ADMIN_EMAIL ||
      process.env.E2E_ADMIN_EMAIL ||
      process.env.TEST_USER_EMAIL,
    pass:
      process.env.TEST_PASSWORD ||
      process.env.E2E_PASSWORD ||
      process.env.TEST_USER_PASSWORD
  };
}

async function loginWithUi(page) {
  const data = credentials();

  if (!data.email || !data.pass) {
    throw new Error(
      'Missing E2E credentials. Set TEST_ADMIN_EMAIL/TEST_PASSWORD locally or E2E_ADMIN_EMAIL/E2E_PASSWORD in CI.'
    );
  }

  await page.goto('/login', {
    waitUntil: 'domcontentloaded'
  });

  await page.waitForLoadState('networkidle').catch(() => {});

  const emailField = page
    .getByLabel(/email|courriel/i)
    .or(page.locator('input[name="email"]'))
    .or(page.locator('input[type="email"]'))
    .or(page.locator('input[autocomplete="email"]'))
    .or(page.locator('input[placeholder*="email" i]'))
    .or(page.locator('input[placeholder*="courriel" i]'))
    .first();

  const passwordField = page
    .getByLabel(/mot de passe|password/i)
    .or(page.locator('input[name="password"]'))
    .or(page.locator('input[type="password"]'))
    .or(page.locator('input[autocomplete="current-password"]'))
    .or(page.locator('input[placeholder*="password" i]'))
    .or(page.locator('input[placeholder*="mot de passe" i]'))
    .first();

  try {
    await expect(emailField).toBeVisible({
      timeout: 10_000
    });

    await expect(passwordField).toBeVisible({
      timeout: 10_000
    });
  } catch (error) {
    const inputCount = await page.locator('input').count();
    const bodyText = await page
      .locator('body')
      .innerText()
      .catch(() => '');

    throw new Error(
      [
        'Login fields not rendered.',
        `URL=${page.url()}`,
        `TITLE=${await page.title()}`,
        `INPUTS=${inputCount}`,
        `BODY=${bodyText.slice(0, 500)}`
      ].join(' ')
    );
  }

  await emailField.fill(data.email);
  await passwordField.fill(data.pass);

  const submitButton = page
    .getByRole('button', {
      name: /connexion|se connecter|login|sign in/i
    })
    .or(page.locator('button[type="submit"]'))
    .first();

  await expect(submitButton).toBeVisible({
    timeout: 10_000
  });

const loginResponsePromise = page.waitForResponse(
  response => {
    const url = response.url();

    return (
      response.request().method() === 'POST' &&
      (
        url.includes('/login') ||
        url.includes('/auth') ||
        url.includes('/api/auth')
      )
    );
  },
  {
    timeout: 15_000
  }
);

await submitButton.click();

let loginResponse;

try {
  loginResponse = await loginResponsePromise;
} catch {
  const bodyText = await page
    .locator('body')
    .innerText()
    .catch(() => '');

  throw new Error(
    [
      'Aucune requête HTTP de connexion détectée.',
      `URL finale : ${page.url()}`,
      `Contenu visible : ${bodyText.slice(0, 1000)}`
    ].join('\n')
  );
}

const status = loginResponse.status();
const responseBody = await loginResponse.text().catch(() => '');

if (!loginResponse.ok()) {
  throw new Error(
    [
      'La requête de connexion E2E a échoué.',
      `Status : ${status}`,
      `Endpoint : ${loginResponse.url()}`,
      `Réponse : ${responseBody.slice(0, 1500)}`
    ].join('\n')
  );
}

try {
  await expect(page).not.toHaveURL(/\/(?:login|signin|auth)(?:\/|$|\?)/i, {
    timeout: 15_000
  });
} catch {
  const bodyText = await page
    .locator('body')
    .innerText()
    .catch(() => '');

  throw new Error(
    [
      'Le backend a accepté la requête, mais le frontend est resté sur la page de connexion.',
      `Status : ${status}`,
      `Endpoint : ${loginResponse.url()}`,
      `Réponse : ${responseBody.slice(0, 1000)}`,
      `URL finale : ${page.url()}`,
      `Contenu visible : ${bodyText.slice(0, 1000)}`
    ].join('\n')
  );
}

  await expect(page.locator('body')).not.toContainText(
    /unauthorized|invalid|identifiants invalides|connexion échouée/i
  );
}

module.exports = {
  loginWithUi
};

