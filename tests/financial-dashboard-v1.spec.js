const { test, expect } = require('@playwright/test');
const { makeTestPassword } = require('./helpers/credentials');
const { apiUrl, apiRequest, entity, signup, unique } = require('./helpers/auth');
const { queryScalar, sqlLiteral, stripeSignature } = require('./helpers/finance');

test.describe('Tableau financier utile V1', () => {
  test('facturé, payé, à recevoir, retard, meilleurs clients et tendance restent isolés', async ({ browser, request }) => {
    const password = makeTestPassword();
    const emailA = `${unique('financial-dashboard-a')}@example.com`;
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const authorizationA = await signup(pageA, {
      organisation: unique('Organisation-finance-A'),
      user: 'Administrateur Finance A',
      email: emailA,
      password,
    });

    const organisationId = queryScalar(`
      SELECT organisation_id
      FROM utilisateurs
      WHERE email = ${sqlLiteral(emailA)}
      LIMIT 1
    `);
    expect(organisationId).toMatch(/^\d+$/);

    const clientAlphaName = unique('Client-Alpha');
    const clientBetaName = unique('Client-Beta');
    const clientAlphaId = queryScalar(`
      INSERT INTO clients (organisation_id, nom, email)
      VALUES (${organisationId}, ${sqlLiteral(clientAlphaName)}, ${sqlLiteral(`${unique('alpha')}@example.com`)})
      RETURNING id
    `);
    const clientBetaId = queryScalar(`
      INSERT INTO clients (organisation_id, nom, email)
      VALUES (${organisationId}, ${sqlLiteral(clientBetaName)}, ${sqlLiteral(`${unique('beta')}@example.com`)})
      RETURNING id
    `);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const paidInvoiceNumber = `FD-${suffix}-PAID`;
    const openInvoiceNumber = `FD-${suffix}-OPEN`;
    const overdueInvoiceNumber = `FD-${suffix}-OVERDUE`;

    const paidInvoiceId = queryScalar(`
      INSERT INTO invoices
        (organisation_id, client_id, invoice_number, status, issue_date, due_date, subtotal, tax_total, total, created_at)
      VALUES
        (${organisationId}, ${clientAlphaId}, ${sqlLiteral(paidInvoiceNumber)}, 'sent', CURRENT_DATE,
         CURRENT_DATE + INTERVAL '15 days', 1000, 0, 1000, NOW())
      RETURNING id
    `);

    queryScalar(`
      INSERT INTO invoices
        (organisation_id, client_id, invoice_number, status, issue_date, due_date, subtotal, tax_total, total, created_at)
      VALUES
        (${organisationId}, ${clientAlphaId}, ${sqlLiteral(openInvoiceNumber)}, 'sent', CURRENT_DATE,
         CURRENT_DATE + INTERVAL '10 days', 400, 0, 400, NOW()),
        (${organisationId}, ${clientBetaId}, ${sqlLiteral(overdueInvoiceNumber)}, 'sent', CURRENT_DATE - INTERVAL '40 days',
         CURRENT_DATE - INTERVAL '10 days', 250, 0, 250, NOW() - INTERVAL '40 days'),
        (${organisationId}, ${clientBetaId}, ${sqlLiteral(`FD-${suffix}-M1`)}, 'paid', CURRENT_DATE - INTERVAL '1 month',
         CURRENT_DATE - INTERVAL '15 days', 110, 0, 110, NOW() - INTERVAL '1 month'),
        (${organisationId}, ${clientBetaId}, ${sqlLiteral(`FD-${suffix}-M2`)}, 'paid', CURRENT_DATE - INTERVAL '2 months',
         CURRENT_DATE - INTERVAL '45 days', 120, 0, 120, NOW() - INTERVAL '2 months')
      RETURNING id
    `);

    const eventId = `evt_financial_dashboard_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
          metadata: { invoice_id: String(paidInvoiceId) },
        },
      },
    };
    const payload = JSON.stringify(event);
    const webhook = await request.post(`${apiUrl}/stripe/webhook`, {
      headers: {
        'content-type': 'application/json',
        'stripe-signature': stripeSignature(payload),
      },
      data: payload,
    });
    expect(webhook.status(), await webhook.text()).toBe(200);

    const dashboard = await apiRequest(contextA, authorizationA, 'GET', '/billing/dashboard');
    const data = entity(dashboard.body, 'dashboard');

    expect(Number(data.total_invoiced_this_month)).toBeGreaterThanOrEqual(1400);
    expect(Number(data.total_paid_this_month)).toBeGreaterThanOrEqual(1000);
    expect(Number(data.outstanding_total)).toBeGreaterThanOrEqual(650);
    expect(Number(data.overdue_total)).toBeGreaterThanOrEqual(250);
    expect(Number(data.overdue_count)).toBeGreaterThanOrEqual(1);
    expect(data.currency).toBe('CAD');
    expect(data.calculated_at).toBeTruthy();
    expect(data.monthly_revenue).toHaveLength(6);
    expect(data.top_clients[0]).toMatchObject({
      client_id: Number(clientAlphaId),
      client_nom: clientAlphaName,
    });
    expect(Number(data.top_clients[0].total_invoiced)).toBeGreaterThanOrEqual(1400);
    expect(Number(data.top_clients[0].total_paid)).toBeGreaterThanOrEqual(1000);

    await pageA.goto('/dashboard');
    await expect(pageA.getByRole('heading', { name: /Tableau financier/i })).toBeVisible();
    await expect(pageA.getByText(/Facturé ce mois/i)).toBeVisible();
    await expect(pageA.getByText(/Payé ce mois/i)).toBeVisible();
    await expect(pageA.getByText(/À recevoir/i)).toBeVisible();
    await expect(pageA.getByText(/^En retard$/i)).toBeVisible();
    await expect(pageA.getByText(clientAlphaName)).toBeVisible();
    await expect(pageA.getByText(/Revenus encaissés sur six mois/i)).toBeVisible();

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const authorizationB = await signup(pageB, {
      organisation: unique('Organisation-finance-B'),
      user: 'Administrateur Finance B',
      email: `${unique('financial-dashboard-b')}@example.com`,
      password,
    });

    const dashboardB = await apiRequest(contextB, authorizationB, 'GET', '/billing/dashboard');
    const dataB = entity(dashboardB.body, 'dashboard');
    expect(Number(dataB.total_invoiced_this_month)).toBe(0);
    expect(Number(dataB.total_paid_this_month)).toBe(0);
    expect(Number(dataB.outstanding_total)).toBe(0);
    expect(Number(dataB.overdue_total)).toBe(0);
    expect(dataB.top_clients).toEqual([]);
    expect(JSON.stringify(dataB)).not.toContain(clientAlphaName);
    expect(JSON.stringify(dataB)).not.toContain(clientBetaName);

    await pageB.goto('/dashboard');
    await expect(pageB.getByText(/Votre tableau financier est prêt/i)).toBeVisible();
    await expect(pageB.locator('body')).not.toContainText(clientAlphaName);
    await expect(pageB.locator('body')).not.toContainText(clientBetaName);

    await contextA.close();
    await contextB.close();
  });
});
