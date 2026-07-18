const { test, expect } = require('@playwright/test');

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
  const body = await response.text();

  expect(response.ok(), `Inscription échouée: ${response.status()} ${body}`).toBeTruthy();
  await expect(page).toHaveURL(/\/(onboarding|dashboard)(?:[/?#]|$)/i, { timeout: 15_000 });
}

async function createClient(page, clientName, clientEmail) {
  await page.goto('/clients');

  const createButton = page
    .locator('button:has-text("Nouveau"), button:has-text("Ajouter"), button:has-text("Créer"), button:has-text("New"), button:has-text("Add"), button:has-text("Create")')
    .first();
  await expect(createButton, 'Le bouton de création de client doit être visible').toBeVisible();
  await createButton.click();

  const nameInput = page.locator('input[name="name"], input[name="nom"], input[placeholder*="nom" i], input[placeholder*="name" i]').first();
  await expect(nameInput, 'Le champ du nom du client doit être visible').toBeVisible();
  await nameInput.fill(clientName);

  const emailInput = page.locator('input[name="email"], input[type="email"]').first();
  if (await emailInput.isVisible().catch(() => false)) {
    await emailInput.fill(clientEmail);
  }

  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === 'POST' && /\/api\/clients(?:[/?#]|$)|\/clients(?:[/?#]|$)/i.test(response.url())
  );

  await page.locator('button[type="submit"]').first().click();
  const response = await responsePromise;
  const bodyText = await response.text();

  expect(response.ok(), `Création client échouée: ${response.status()} ${bodyText}`).toBeTruthy();

  const body = JSON.parse(bodyText);
  const clientId = body.id ?? body.client?.id ?? body.data?.id ?? body.data?.client?.id;
  expect(clientId, 'La création du client doit retourner un identifiant').toBeTruthy();

  await expect(page.locator('body')).toContainText(clientName);
  return clientId;
}

test.describe('Isolation multi-tenant P0', () => {
  test('B ne peut ni voir ni lire directement le client de A', async ({ browser }) => {
    const password = 'TestPassword123!';
    const clientNameA = unique('Client-tenant-A');
    const clientEmailA = `${unique('client-a')}@example.com`;

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await signup(pageA, {
      organisation: unique('Organisation-A'),
      user: 'Utilisateur A',
      email: `${unique('tenant-a')}@example.com`,
      password,
    });
    const clientIdA = await createClient(pageA, clientNameA, clientEmailA);

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await signup(pageB, {
      organisation: unique('Organisation-B'),
      user: 'Utilisateur B',
      email: `${unique('tenant-b')}@example.com`,
      password,
    });

    const clientListRequestPromise = pageB.waitForRequest((request) =>
      request.method() === 'GET' && /\/api\/clients(?:[/?#]|$)/i.test(request.url())
    );
    await pageB.goto('/clients');
    const clientListRequest = await clientListRequestPromise;

    await expect(pageB.locator('body')).not.toContainText(clientNameA);
    await expect(pageB.locator('body')).not.toContainText(clientEmailA);

    const authorization = clientListRequest.headers().authorization;
    expect(authorization, 'La requête métier de B doit porter un jeton Authorization').toBeTruthy();

    const apiUrl = process.env.TEST_API_URL || 'http://127.0.0.1:5000/api';
    const crossTenantResponse = await contextB.request.get(`${apiUrl}/clients/${clientIdA}`, {
      headers: {
        accept: 'application/json',
        authorization,
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
