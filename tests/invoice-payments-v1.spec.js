const { test, expect } = require('@playwright/test');
const { apiUrl, apiRequest, entity, signup, unique } = require('./helpers/auth');
const { queryScalar, sqlLiteral } = require('./helpers/finance');

test.describe('Encaissements et paiements partiels V1', () => {
  test('paiement partiel, idempotence, solde nul, arrêt des relances et isolation', async ({ browser }) => {
    const password = 'TestPassword123!';
    const emailA = `${unique('payments-a')}@example.com`;
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const authorizationA = await signup(pageA, {
      organisation: unique('Organisation-paiements-A'),
      user: 'Administrateur Paiements A',
      email: emailA,
      password,
    });

    const organisationA = queryScalar(`
      SELECT organisation_id FROM utilisateurs WHERE email = ${sqlLiteral(emailA)} LIMIT 1
    `);
    const clientId = queryScalar(`
      INSERT INTO clients (organisation_id, nom, email)
      VALUES (${organisationA}, ${sqlLiteral(unique('Client-paiements'))}, ${sqlLiteral(`${unique('client')}@example.com`)})
      RETURNING id
    `);
    const invoiceNumber = `PAY-${Date.now()}`;
    const invoiceId = queryScalar(`
      INSERT INTO invoices
        (organisation_id, client_id, invoice_number, status, issue_date, due_date,
         subtotal, tax_total, total, finalized_at, snapshot, created_at)
      VALUES
        (${organisationA}, ${clientId}, ${sqlLiteral(invoiceNumber)}, 'sent', CURRENT_DATE - INTERVAL '10 days',
         CURRENT_DATE - INTERVAL '3 days', 100, 0, 100, NOW(),
         ${sqlLiteral(JSON.stringify({ subtotal: 100, tax_total: 0, total: 100, items: [] }))}::jsonb, NOW())
      RETURNING id
    `);

    const firstKey = `payment-first-${Date.now()}`;
    const first = await apiRequest(contextA, authorizationA, 'POST', `/invoice-payments/invoices/${invoiceId}`, {
      amount: 40,
      method: 'bank_transfer',
      external_reference: 'VIR-001',
      note: 'Premier versement',
      idempotency_key: firstKey,
    });
    const firstResult = entity(first.body, 'result');
    expect(firstResult.duplicate).toBe(false);
    expect(firstResult.summary).toMatchObject({
      total: '100.00',
      paid_total: '40.00',
      balance: '60.00',
      is_paid: false,
      status: 'sent',
    });

    const duplicate = await apiRequest(contextA, authorizationA, 'POST', `/invoice-payments/invoices/${invoiceId}`, {
      amount: 40,
      method: 'bank_transfer',
      external_reference: 'VIR-001',
      note: 'Premier versement',
      idempotency_key: firstKey,
    });
    expect(entity(duplicate.body, 'result').duplicate).toBe(true);
    expect(Number(queryScalar(`SELECT COUNT(*) FROM invoice_payments WHERE invoice_id = ${invoiceId}`))).toBe(1);
    expect(Number(queryScalar(`
      SELECT COUNT(*) FROM ledger_entries
      WHERE organisation_id = ${organisationA}
        AND reference_type = 'invoice_payment'
    `))).toBe(1);

    const overpayment = await contextA.request.post(`${apiUrl}/invoice-payments/invoices/${invoiceId}`, {
      headers: { authorization: authorizationA, 'content-type': 'application/json' },
      data: {
        amount: 61,
        method: 'cash',
        idempotency_key: `payment-over-${Date.now()}`,
      },
    });
    expect(overpayment.status()).toBe(409);

    const second = await apiRequest(contextA, authorizationA, 'POST', `/invoice-payments/invoices/${invoiceId}`, {
      amount: 60,
      method: 'cheque',
      external_reference: 'CHQ-002',
      idempotency_key: `payment-second-${Date.now()}`,
    });
    expect(entity(second.body, 'result').summary).toMatchObject({
      paid_total: '100.00',
      balance: '0.00',
      is_paid: true,
      status: 'paid',
    });

    const history = await apiRequest(contextA, authorizationA, 'GET', `/invoice-payments/invoices/${invoiceId}`);
    const paymentData = entity(history.body, 'result');
    expect(paymentData.payments).toHaveLength(2);
    expect(paymentData.summary.balance).toBe('0.00');
    expect(queryScalar(`SELECT status FROM invoices WHERE id = ${invoiceId}`)).toBe('paid');

    const candidates = await apiRequest(contextA, authorizationA, 'GET', '/payment-reminders/candidates');
    const candidateRows = entity(candidates.body, 'candidates');
    expect(candidateRows.some((row) => Number(row.id) === Number(invoiceId))).toBe(false);

    const emailB = `${unique('payments-b')}@example.com`;
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const authorizationB = await signup(pageB, {
      organisation: unique('Organisation-paiements-B'),
      user: 'Administrateur Paiements B',
      email: emailB,
      password,
    });

    const crossRead = await contextB.request.get(`${apiUrl}/invoice-payments/invoices/${invoiceId}`, {
      headers: { authorization: authorizationB },
    });
    expect(crossRead.status()).toBe(404);

    const crossWrite = await contextB.request.post(`${apiUrl}/invoice-payments/invoices/${invoiceId}`, {
      headers: { authorization: authorizationB, 'content-type': 'application/json' },
      data: {
        amount: 1,
        method: 'cash',
        idempotency_key: `cross-${Date.now()}`,
      },
    });
    expect(crossWrite.status()).toBe(404);

    await contextA.close();
    await contextB.close();
  });
});
