const { test, expect } = require('@playwright/test');
const { apiUrl, apiRequest, entity, signup, unique } = require('./helpers/auth');
const { queryScalar, sqlLiteral, stripeSignature } = require('./helpers/finance');

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
