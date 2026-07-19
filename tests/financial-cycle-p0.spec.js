const { test, expect } = require('@playwright/test');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const apiUrl = process.env.TEST_API_URL || 'http://127.0.0.1:5000/api';
const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function queryScalar(sql) {
  if (!databaseUrl) {
    throw new Error('TEST_DATABASE_URL ou DATABASE_URL est requis pour la preuve financière P0.');
  }

  return execFileSync(
    'psql',
    [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', sql],
    { encoding: 'utf8' }
  ).trim();
}

function stripeSignature(payload, timestamp = Math.floor(Date.now() / 1000)) {
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET est requis pour signer le webhook E2E.');
  }

  const digest = crypto
    .createHmac('sha256', webhookSecret)
    .update(`${timestamp}.${payload}`, 'utf8')
    .digest('hex');

  return `t=${timestamp},v1=${digest}`;
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

test.describe('Cycle financier P0', () => {
  test('facture → webhook signé → ledger → dashboard → rejeu sans doublon', async ({ page, request }) => {
    const email = `${unique('finance-p0')}@example.com`;
    const password = 'TestPassword123!';
    const organisationName = unique('Organisation-finance-P0');
    const invoiceNumber = `INV-E2E-${Date.now()}`;
    const eventId = `evt_e2e_finance_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const authorization = await signup(page, {
      organisation: organisationName,
      user: 'Administrateur Finance P0',
      email,
      password,
    });

    const organisationId = queryScalar(`
      SELECT organisation_id
      FROM utilisateurs
      WHERE email = ${sqlLiteral(email)}
      LIMIT 1
    `);
    expect(organisationId).toMatch(/^\d+$/);

    const clientId = queryScalar(`
      INSERT INTO clients (organisation_id, nom, email)
      VALUES (${organisationId}, ${sqlLiteral(unique('Client-finance-P0'))}, ${sqlLiteral(`${unique('client')}@example.com`)})
      RETURNING id
    `);
    expect(clientId).toMatch(/^\d+$/);

    const invoiceId = queryScalar(`
      INSERT INTO invoices
        (organisation_id, client_id, invoice_number, status, issue_date, due_date, subtotal, tax_total, total, notes)
      VALUES
        (${organisationId}, ${clientId}, ${sqlLiteral(invoiceNumber)}, 'sent', CURRENT_DATE, CURRENT_DATE + INTERVAL '15 days', 125, 0, 125, 'preuve E2E P0')
      RETURNING id
    `);
    expect(invoiceId).toMatch(/^\d+$/);

    const event = {
      id: eventId,
      object: 'event',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: `pi_${eventId}`,
          object: 'payment_intent',
          amount: 12500,
          currency: 'cad',
          metadata: { invoice_id: String(invoiceId) },
        },
      },
    };
    const payload = JSON.stringify(event);
    const signature = stripeSignature(payload);

    const firstWebhook = await request.post(`${apiUrl}/stripe/webhook`, {
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signature,
      },
      data: payload,
    });
    expect(firstWebhook.status(), await firstWebhook.text()).toBe(200);

    const replayWebhook = await request.post(`${apiUrl}/stripe/webhook`, {
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signature,
      },
      data: payload,
    });
    expect(replayWebhook.status(), await replayWebhook.text()).toBe(200);

    expect(queryScalar(`SELECT status FROM invoices WHERE id = ${invoiceId}`)).toBe('paid');
    expect(queryScalar(`SELECT COUNT(*) FROM payment_events WHERE stripe_event_id = ${sqlLiteral(eventId)}`)).toBe('1');
    expect(queryScalar(`
      SELECT COUNT(*)
      FROM ledger_entries
      WHERE organisation_id = ${organisationId}
        AND reference_type = 'stripe_webhook'
        AND reference_id = ${sqlLiteral(eventId)}
        AND type = 'payment_received'
        AND amount = 125
        AND LOWER(currency) = 'cad'
    `)).toBe('1');

    const dashboardResponse = await request.get(`${apiUrl}/billing/dashboard`, {
      headers: { authorization, accept: 'application/json' },
    });
    const dashboardBody = await dashboardResponse.json();

    expect(dashboardResponse.ok(), JSON.stringify(dashboardBody)).toBeTruthy();
    expect(Number(dashboardBody.total_invoiced_this_month)).toBe(125);
    expect(Number(dashboardBody.total_paid_this_month)).toBe(125);
    expect(Number(dashboardBody.overdue_total)).toBe(0);

    await page.goto('/dashboard');
    await page.reload();
    await expect(page.locator('body')).toContainText(/125[,.]00|125\s*\$|\$\s*125/i);
  });
});