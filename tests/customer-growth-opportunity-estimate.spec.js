const { test, expect } = require('@playwright/test');

const apiUrl = process.env.TEST_API_URL || 'http://127.0.0.1:5000/api';

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function accessToken(body) {
  return body?.data?.token ?? body?.data?.access_token ?? body?.data?.accessToken ?? body?.token ?? body?.access_token ?? body?.accessToken;
}

function entity(body, key) {
  return body?.data?.[key] ?? body?.[key] ?? body?.data ?? body;
}

async function json(response, label) {
  const text = await response.text();
  expect(response.ok(), `${label}: ${response.status()} ${text}`).toBeTruthy();
  try { return JSON.parse(text); } catch { throw new Error(`${label} doit retourner du JSON. Corps reçu: ${text}`); }
}

async function signup(page, account) {
  await page.goto('/signup');
  await page.locator('[name="organisation_nom"]').fill(account.organisation);
  await page.locator('[name="user_nom"]').fill(account.user);
  await page.locator('[name="email"]').fill(account.email);
  await page.locator('[name="password"]').fill(account.password);
  const responsePromise = page.waitForResponse((response) => response.request().method() === 'POST' && /signup|register/i.test(response.url()));
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
    headers: { accept: 'application/json', authorization, ...(data ? { 'content-type': 'application/json' } : {}) },
    ...(data ? { data } : {}),
  });
  return { response, body: await json(response, `${method} ${path}`) };
}

test.describe('Parcours opportunité vers soumission', () => {
  test('qualifie et convertit une opportunité sans doublon ni fuite entre organisations', async ({ browser }) => {
    const password = 'TestPassword123!';
    const clientName = unique('Client-opportunite-A');
    const opportunityTitle = unique('Refonte-portail-A');

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const authorizationA = await signup(pageA, {
      organisation: unique('Organisation-A'), user: 'Administrateur A', email: `${unique('admin-a')}@example.com`, password,
    });

    const createdClient = await apiRequest(contextA, authorizationA, 'POST', '/clients', {
      nom: clientName, email: `${unique('client-a')}@example.com`,
    });
    const client = entity(createdClient.body, 'client');
    expect(client.id).toBeTruthy();

    const createdOpportunity = await apiRequest(contextA, authorizationA, 'POST', '/customer-growth/opportunities', {
      client_id: client.id,
      lead_id: null,
      owner_user_id: null,
      title: opportunityTitle,
      description: 'Soumission créée par la preuve E2E.',
      estimated_value: 7500,
      probability: 80,
      expected_close_date: null,
    });
    const opportunity = entity(createdOpportunity.body, 'opportunity');
    expect(opportunity.id).toBeTruthy();
    expect(opportunity.status).toBe('open');

    await apiRequest(contextA, authorizationA, 'PATCH', `/customer-growth/opportunities/${opportunity.id}`, { status: 'qualified' });

    const idempotencyKey = `e2e-opportunity-${opportunity.id}-estimate`;
    const firstConversion = await apiRequest(contextA, authorizationA, 'POST', `/customer-growth/opportunities/${opportunity.id}/estimate`, {
      idempotency_key: idempotencyKey,
    });
    expect(firstConversion.response.status()).toBe(201);
    const estimate = entity(firstConversion.body, 'estimate');
    expect(estimate.id).toBeTruthy();
    expect(Number(estimate.total)).toBe(7500);

    const replay = await apiRequest(contextA, authorizationA, 'POST', `/customer-growth/opportunities/${opportunity.id}/estimate`, {
      idempotency_key: idempotencyKey,
    });
    expect(replay.response.status()).toBe(200);
    expect(entity(replay.body, 'estimate').id).toBe(estimate.id);

    const refreshed = await apiRequest(contextA, authorizationA, 'GET', `/customer-growth/opportunities/${opportunity.id}`);
    const proposal = entity(refreshed.body, 'opportunity');
    expect(proposal.status).toBe('proposal');
    expect(Number(proposal.produced_estimate_id)).toBe(Number(estimate.id));

    const estimatesA = await apiRequest(contextA, authorizationA, 'GET', '/estimates');
    expect(JSON.stringify(estimatesA.body)).toContain(estimate.estimate_number);

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const authorizationB = await signup(pageB, {
      organisation: unique('Organisation-B'), user: 'Administrateur B', email: `${unique('admin-b')}@example.com`, password,
    });

    const opportunitiesB = await apiRequest(contextB, authorizationB, 'GET', '/customer-growth/opportunities?limit=100&offset=0');
    expect(JSON.stringify(opportunitiesB.body)).not.toContain(opportunityTitle);
    expect(JSON.stringify(opportunitiesB.body)).not.toContain(estimate.estimate_number);

    const estimatesB = await apiRequest(contextB, authorizationB, 'GET', '/estimates');
    expect(JSON.stringify(estimatesB.body)).not.toContain(estimate.estimate_number);

    const crossOpportunity = await contextB.request.get(`${apiUrl}/customer-growth/opportunities/${opportunity.id}`, {
      headers: { accept: 'application/json', authorization: authorizationB },
    });
    expect([403, 404]).toContain(crossOpportunity.status());
    expect(await crossOpportunity.text()).not.toContain(opportunityTitle);

    const crossEstimate = await contextB.request.get(`${apiUrl}/estimates/${estimate.id}`, {
      headers: { accept: 'application/json', authorization: authorizationB },
    });
    expect([403, 404]).toContain(crossEstimate.status());
    expect(await crossEstimate.text()).not.toContain(estimate.estimate_number);

    await contextA.close();
    await contextB.close();
  });
});