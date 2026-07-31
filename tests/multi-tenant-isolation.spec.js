const { test, expect } = require('@playwright/test');
const { makeTestPassword } = require('./helpers/credentials');
const { apiUrl, apiRequest, entity, signup, unique } = require('./helpers/auth');

test.describe('Isolation multi-tenant P0', () => {
  test('B ne peut ni voir ni lire directement le client de A', async ({ browser }) => {
    const password = makeTestPassword();
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

    const createdClient = await apiRequest(contextA, authorizationA, 'POST', '/clients', {
      nom: clientNameA,
      email: clientEmailA,
    });
    const clientIdA = entity(createdClient.body, 'client').id;
    expect(clientIdA, 'La création du client doit retourner un identifiant').toBeTruthy();

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
      headers: { accept: 'application/json', authorization: authorizationB },
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
