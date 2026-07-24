const { test, expect } = require('@playwright/test');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const apiUrl = process.env.TEST_API_URL || 'http://127.0.0.1:5000/api';
const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function entity(body, key) {
  return body?.data?.[key] ?? body?.[key] ?? body?.data ?? body;
}

function accessToken(body) {
  return body?.data?.token ?? body?.data?.access_token ?? body?.data?.accessToken ?? body?.token ?? body?.access_token ?? body?.accessToken;
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function queryScalar(sql) {
  if (!databaseUrl) throw new Error('TEST_DATABASE_URL ou DATABASE_URL est requis.');
  return execFileSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', sql], { encoding: 'utf8' }).trim();
}

function stripeSignature(payload, timestamp = Math.floor(Date.now() / 1000)) {
  if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET est requis.');
  const digest = crypto.createHmac('sha256', webhookSecret).update(`${timestamp}.${payload}`, 'utf8').digest('hex');
  return `t=${timestamp},v1=${digest}`;
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

test.describe('Cycle complet de revenus', () => {
  test('prospect → client → opportunité → soumission → facture → paiement', async ({ browser, request }) => {
    const password = 'TestPassword123!';
    const emailA = `${unique('revenue-admin-a')}@example.com`;
    const prospectName = unique('Prospect-revenu');
    const companyName = unique('Entreprise-revenu');
    const opportunityTitle = unique('Mandat-revenu');

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const authorizationA = await signup(pageA, {
      organisation: unique('Organisation-revenu-A'),
      user: 'Administrateur Revenus A',
      email: emailA,
      password,
    });

    const createdLead = await apiRequest(contextA, authorizationA, 'POST', '/customer-growth/leads', {
      display_name: prospectName,
      company_name: companyName,
      email: `${unique('prospect')}@example.com`,
      source: 'E2E cycle revenus',
      notes: 'Créé par la preuve complète du cycle de revenus.',
    });
    const lead = entity(createdLead.body, 'lead');
    await apiRequest(contextA, authorizationA, 'PATCH', `/customer-growth/leads/${lead.id}`, { status: 'contacted' });
    await apiRequest(contextA, authorizationA, 'PATCH', `/customer-growth/leads/${lead.id}`, { status: 'qualified' });

    const leadConversion = await apiRequest(contextA, authorizationA, 'POST', `/customer-growth/leads/${lead.id}/convert`, {
      idempotency_key: `revenue-lead-${lead.id}`,
    });
    const client = entity(leadConversion.body, 'client');
    expect(client.id).toBeTruthy();

    const createdOpportunity = await apiRequest(contextA, authorizationA, 'POST', '/customer-growth/opportunities', {
      lead_id: null,
      client_id: client.id,
      owner_user_id: null,
      title: opportunityTitle,
      description: 'Cycle complet de revenus MADSuite.',
      estimated_value: 1000,
      probability: 90,
      expected_close_date: null,
    });
    const opportunity = entity(createdOpportunity.body, 'opportunity');
    await apiRequest(contextA, authorizationA, 'PATCH', `/customer-growth/opportunities/${opportunity.id}`, { status: 'qualified' });

    const estimateConversion = await apiRequest(contextA, authorizationA, 'POST', `/customer-growth/opportunities/${opportunity.id}/estimate`, {
      idempotency_key: `revenue-opportunity-${opportunity.id}`,
      tax_rate: 0,
    });
    const estimate = entity(estimateConversion.body, 'estimate');
    expect(Number(estimate.total)).toBe(1000);

    await apiRequest(contextA, authorizationA, 'PATCH', `/estimates/${estimate.id}`, { status: 'accepted' });
    const invoiceConversion = await apiRequest(contextA, authorizationA, 'POST', `/estimates/${estimate.id}/convert`);
    expect(invoiceConversion.response.status()).toBe(201);
    const invoice = entity(invoiceConversion.body, 'invoice');
    expect(invoice.id).toBeTruthy();
    expect(Number(invoice.total)).toBe(1000);

    const organisationId = queryScalar(`
      SELECT organisation_id FROM utilisateurs
      WHERE email = ${sqlLiteral(emailA)}
      LIMIT 1
    `);
    expect(organisationId).toMatch(/^\d+$/);

    const eventId = `evt_revenue_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const event = {
      id: eventId,
      object: 'event',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: `pi_${eventId}`,
          object: 'payment_intent',
          amount: 100000,
          currency: 'cad',
          metadata: { invoice_id: String(invoice.id) },
        },
      },
    };
    const payload = JSON.stringify(event);
    const webhook = await request.post(`${apiUrl}/stripe/webhook`, {
      headers: { 'content-type': 'application/json', 'stripe-signature': stripeSignature(payload) },
      data: payload,
    });
    expect(webhook.status(), await webhook.text()).toBe(200);

    expect(queryScalar(`SELECT status FROM invoices WHERE id = ${invoice.id}`)).toBe('paid');
    expect(queryScalar(`SELECT status FROM estimates WHERE id = ${estimate.id}`)).toBe('invoiced');
    expect(queryScalar(`SELECT COUNT(*) FROM payment_events WHERE stripe_event_id = ${sqlLiteral(eventId)}`)).toBe('1');
    expect(queryScalar(`
      SELECT COUNT(*) FROM ledger_entries
      WHERE organisation_id = ${organisationId}
        AND reference_type = 'stripe_webhook'
        AND reference_id = ${sqlLiteral(eventId)}
        AND type = 'payment_received'
        AND amount = 1000
    `)).toBe('1');

    const dashboard = await apiRequest(contextA, authorizationA, 'GET', '/billing/dashboard');
    const dashboardData = entity(dashboard.body, 'dashboard');
    expect(Number(dashboardData.total_invoiced_this_month ?? dashboardData.total_invoiced)).toBeGreaterThanOrEqual(1000);
    expect(Number(dashboardData.total_paid_this_month ?? dashboardData.total_paid)).toBeGreaterThanOrEqual(1000);

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const authorizationB = await signup(pageB, {
      organisation: unique('Organisation-revenu-B'),
      user: 'Administrateur Revenus B',
      email: `${unique('revenue-admin-b')}@example.com`,
      password,
    });

    const leadsB = await apiRequest(contextB, authorizationB, 'GET', '/customer-growth/leads?limit=100&offset=0');
    const opportunitiesB = await apiRequest(contextB, authorizationB, 'GET', '/customer-growth/opportunities?limit=100&offset=0');
    const estimatesB = await apiRequest(contextB, authorizationB, 'GET', '/estimates');
    const invoicesB = await apiRequest(contextB, authorizationB, 'GET', '/invoices');
    const isolatedPayload = JSON.stringify([leadsB.body, opportunitiesB.body, estimatesB.body, invoicesB.body]);
    expect(isolatedPayload).not.toContain(prospectName);
    expect(isolatedPayload).not.toContain(companyName);
    expect(isolatedPayload).not.toContain(opportunityTitle);
    expect(isolatedPayload).not.toContain(estimate.estimate_number);
    expect(isolatedPayload).not.toContain(invoice.invoice_number);

    await contextA.close();
    await contextB.close();
  });
});
