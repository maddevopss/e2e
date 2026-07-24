const { test, expect } = require('@playwright/test');

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

async function signup(page, account) {
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
  return `Bearer ${token}`;
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

test.describe('Parcours soumission vers facture', () => {
  test('accepte et convertit une soumission sans fuite entre organisations', async ({ browser }) => {
    const password = 'TestPassword123!';
    const clientName = unique('Client-soumission-A');
    const itemDescription = unique('Service-conseil-A');

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const authorizationA = await signup(pageA, {
      organisation: unique('Organisation-A'),
      user: 'Administrateur A',
      email: `${unique('admin-a')}@example.com`,
      password,
    });

    const createdClient = await apiRequest(contextA, authorizationA, 'POST', '/clients', {
      nom: clientName,
      email: `${unique('client-a')}@example.com`,
    });
    const client = entity(createdClient.body, 'client');
    expect(client.id).toBeTruthy();

    const createdEstimate = await apiRequest(contextA, authorizationA, 'POST', '/estimates', {
      client_id: client.id,
      items: [
        { description: itemDescription, quantity: 2, unit_rate: 625 },
      ],
      tax_rate: 0,
      notes: 'Soumission de la preuve E2E.',
    });
    expect(createdEstimate.response.status()).toBe(201);
    const estimate = entity(createdEstimate.body, 'estimate');
    expect(estimate.id).toBeTruthy();
    expect(Number(estimate.total)).toBe(1250);
    expect(estimate.status).toBe('draft');

    const accepted = await apiRequest(contextA, authorizationA, 'PATCH', `/estimates/${estimate.id}`, {
      status: 'accepted',
    });
    expect(entity(accepted.body, 'estimate').status).toBe('accepted');

    const conversion = await apiRequest(contextA, authorizationA, 'POST', `/estimates/${estimate.id}/convert`);
    expect(conversion.response.status()).toBe(201);
    const invoice = entity(conversion.body, 'invoice');
    expect(invoice.id).toBeTruthy();
    expect(invoice.invoice_number).toBeTruthy();
    expect(Number(invoice.total)).toBe(1250);

    const refreshedEstimate = await apiRequest(contextA, authorizationA, 'GET', `/estimates/${estimate.id}`);
    const invoicedEstimate = entity(refreshedEstimate.body, 'estimate');
    expect(invoicedEstimate.status).toBe('invoiced');
    expect(JSON.stringify(invoicedEstimate)).toContain(itemDescription);

    const invoicesA = await apiRequest(contextA, authorizationA, 'GET', '/invoices');
    const invoicesAText = JSON.stringify(invoicesA.body);
    expect(invoicesAText).toContain(invoice.invoice_number);
    expect(invoicesAText).toContain(clientName);

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const authorizationB = await signup(pageB, {
      organisation: unique('Organisation-B'),
      user: 'Administrateur B',
      email: `${unique('admin-b')}@example.com`,
      password,
    });

    const estimatesB = await apiRequest(contextB, authorizationB, 'GET', '/estimates');
    expect(JSON.stringify(estimatesB.body)).not.toContain(estimate.estimate_number);
    expect(JSON.stringify(estimatesB.body)).not.toContain(itemDescription);

    const invoicesB = await apiRequest(contextB, authorizationB, 'GET', '/invoices');
    expect(JSON.stringify(invoicesB.body)).not.toContain(invoice.invoice_number);
    expect(JSON.stringify(invoicesB.body)).not.toContain(clientName);

    const crossEstimate = await contextB.request.get(`${apiUrl}/estimates/${estimate.id}`, {
      headers: { accept: 'application/json', authorization: authorizationB },
    });
    expect([403, 404]).toContain(crossEstimate.status());
    expect(await crossEstimate.text()).not.toContain(estimate.estimate_number);

    const crossInvoice = await contextB.request.get(`${apiUrl}/invoices/${invoice.id}`, {
      headers: { accept: 'application/json', authorization: authorizationB },
    });
    expect([403, 404]).toContain(crossInvoice.status());
    expect(await crossInvoice.text()).not.toContain(invoice.invoice_number);

    await contextA.close();
    await contextB.close();
  });
});
