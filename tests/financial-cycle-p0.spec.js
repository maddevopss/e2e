const { test, expect } = require('@playwright/test');
const { makeTestPassword } = require('./helpers/credentials');
const { apiUrl, signup, unique } = require('./helpers/auth');
const { queryScalar, sqlLiteral, stripeSignature } = require('./helpers/finance');

test.describe('Cycle financier P0', () => {
  test('facture → webhook signé → ledger → dashboard → rejeu sans doublon', async ({ page, request }) => {
    const email = `${unique('finance-p0')}@example.com`;
    const password = makeTestPassword();
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

    const dashboardData = dashboardBody?.data ?? dashboardBody;
    expect(dashboardData, `Réponse dashboard invalide: ${JSON.stringify(dashboardBody)}`).toBeTruthy();
    expect(Number(dashboardData.total_invoiced_this_month)).toBe(125);
    expect(Number(dashboardData.total_paid_this_month)).toBe(125);
    expect(Number(dashboardData.overdue_total)).toBe(0);

    await page.evaluate(() => {
      window.history.pushState({}, '', '/dashboard');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await expect(page).toHaveURL(/\/dashboard(?:[/?#]|$)/i);
    await expect(page.locator('body')).toContainText(/125[,.]00|125\s*\$|\$\s*125/i, {
      timeout: 15_000,
    });
  });
});
