const { test, expect } = require('@playwright/test');

const apiUrl = process.env.TEST_API_URL || 'http://127.0.0.1:5000/api';

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function extractAccessToken(body) {
  return (
    body?.data?.token ??
    body?.data?.access_token ??
    body?.data?.accessToken ??
    body?.token ??
    body?.access_token ??
    body?.accessToken
  );
}

async function signup(page, { organisation, user, email, password }) {
  await page.goto('/signup');
  await page.locator('[name="organisation_nom"]').fill(organisation);
  await page.locator('[name="user_nom"]').fill(user);
  await page.locator('[name="email"]').fill(email);
  await page.locator('[name="password"]').fill(password);

  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === 'POST' && /signup|register/i.test(response.url())
  );

  await page.locator('button[type="submit"]').click();
  const response = await responsePromise;
  const bodyText = await response.text();

  expect(response.ok(), `Inscription échouée: ${response.status()} ${bodyText}`).toBeTruthy();

  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new Error('La réponse d’inscription doit être un JSON contenant un jeton d’accès.');
  }

  const token = extractAccessToken(body);
  expect(token, 'La réponse d’inscription doit retourner un jeton d’accès réel').toBeTruthy();

  await expect(page).toHaveURL(/\/(onboarding|dashboard)(?:[/?#]|$)/i, { timeout: 15_000 });
  return `Bearer ${token}`;
}

async function createClient(context, authorization, clientName, clientEmail) {
  const response = await context.request.post(`${apiUrl}/clients`, {
    headers: {
      accept: 'application/json',
      authorization,
      'content-type': 'application/json',
    },
    data: {
      nom: clientName,
      email: clientEmail,
    },
  });

  const bodyText = await response.text();
  expect(response.ok(), `Création client échouée: ${response.status()} ${bodyText}`).toBeTruthy();

  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new Error(`La création client doit retourner du JSON. Corps reçu: ${bodyText}`);
  }

  const clientId = body.id ?? body.client?.id ?? body.data?.id ?? body.data?.client?.id;
  expect(clientId, 'La création du client doit retourner un identifiant').toBeTruthy();
  return clientId;
}

test.describe('Isolation multi-tenant P0', () => {
  test('B ne peut ni voir ni lire directement le client de A', async ({ browser }) => {
    const password = 'TestPassword123!';
    const clientNameA = unique('Client-tenant-A');
    const clientEmailA = `${unique('client-a')}@example.com`;

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const authorizationA = await signup(pageA, {
      organisation: unique('Organisation-A'),
      user: 'Utilisateur A',
      email: `${unique('tenant-a')}@example.com`,
      password,
    });
    const clientIdA = await createClient(contextA, authorizationA, clientNameA, clientEmailA);

    await pageA.goto('/clients');
    await expect(pageA.locator('body')).toContainText(clientNameA, { timeout: 15_000 });

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const authorizationB = await signup(pageB, {
      organisation: unique('Organisation-B'),
      user: 'Utilisateur B',
      email: `${unique('tenant-b')}@example.com`,
      password,
    });

    await pageB.goto('/clients');
    await expect(pageB).toHaveURL(/\/clients(?:[/?#]|$)/i, { timeout: 15_000 });
    await expect(pageB.locator('body')).not.toContainText(clientNameA);
    await expect(pageB.locator('body')).not.toContainText(clientEmailA);

    const crossTenantResponse = await contextB.request.get(`${apiUrl}/clients/${clientIdA}`, {
      headers: {
        accept: 'application/json',
        authorization: authorizationB,
      },
    });

    const crossTenantBody = await crossTenantResponse.text();
    expect(
      [403, 404],
      `B ne doit pas lire le client de A. Statut obtenu: ${crossTenantResponse.status()} Corps: ${crossTenantBody}`
    ).toContain(crossTenantResponse.status());
    expect(crossTenantBody).not.toContain(clientNameA);
    expect(crossTenantBody).not.toContain(clientEmailA);

    await contextA.close();
    await contextB.close();
  });
});