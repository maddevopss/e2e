const { test, expect } = require('@playwright/test');
const { makeTestPassword } = require('./helpers/credentials');
const { apiUrl, apiRequest, entity, signup, unique } = require('./helpers/auth');
const { queryScalar, sqlLiteral } = require('./helpers/finance');

test.describe('Relances de paiement V1', () => {
  test('J+3 est idempotent, livré, isolé et arrêté après paiement', async ({ browser }) => {
    const password = makeTestPassword();
    const emailA = `${unique('reminders-a')}@example.com`;
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const authorizationA = await signup(pageA, {
      organisation: unique('Organisation-relances-A'),
      user: 'Administrateur Relances A',
      email: emailA,
      password,
    });

    const organisationA = queryScalar(`
      SELECT organisation_id FROM utilisateurs
      WHERE email = ${sqlLiteral(emailA)} LIMIT 1
    `);
    const clientEmail = `${unique('client-relance')}@example.com`;
    const clientId = queryScalar(`
      INSERT INTO clients (organisation_id, nom, email)
      VALUES (${organisationA}, ${sqlLiteral(unique('Client-relance'))}, ${sqlLiteral(clientEmail)})
      RETURNING id
    `);
    const invoiceNumber = `REM-${Date.now()}`;
    const invoiceId = queryScalar(`
      INSERT INTO invoices
        (organisation_id, client_id, invoice_number, status, issue_date, due_date,
         subtotal, tax_total, total, finalized_at, snapshot, created_at)
      VALUES
        (${organisationA}, ${clientId}, ${sqlLiteral(invoiceNumber)}, 'sent', CURRENT_DATE - INTERVAL '10 days',
         CURRENT_DATE - INTERVAL '3 days', 100, 15, 115, NOW(),
         ${sqlLiteral(JSON.stringify({ subtotal: 100, tax_total: 15, total: 115, items: [] }))}::jsonb,
         NOW())
      RETURNING id
    `);

    const candidatesResponse = await apiRequest(contextA, authorizationA, 'GET', '/payment-reminders/candidates');
    const candidates = entity(candidatesResponse.body, 'candidates');
    const candidate = candidates.find((item) => Number(item.id) === Number(invoiceId));
    expect(candidate).toMatchObject({
      invoice_number: invoiceNumber,
      next_stage: 3,
      can_send: true,
    });

    const previewResponse = await apiRequest(
      contextA,
      authorizationA,
      'GET',
      `/payment-reminders/invoices/${invoiceId}/preview?stage=3`,
    );
    const preview = entity(previewResponse.body, 'preview');
    expect(preview).toMatchObject({
      invoice_id: invoiceId,
      invoice_number: invoiceNumber,
      recipient: clientEmail,
      stage: 3,
      type: 'gentle',
      portal_link_created_on_send: true,
    });
    expect(preview.subject).toContain(invoiceNumber);
    expect(preview.message).toContain('115.00 $ CA');
    expect(preview.portal_url).toBeNull();

    const queuedResponse = await apiRequest(
      contextA,
      authorizationA,
      'POST',
      `/payment-reminders/invoices/${invoiceId}/send`,
      { stage: 3 },
    );
    const queued = entity(queuedResponse.body, 'result');
    expect(queued).toMatchObject({ duplicate: false, status: 'queued' });
    expect(queued.preview.portal_url).toMatch(/\/portal\/[A-Za-z0-9_-]{43}$/);

    const duplicateResponse = await apiRequest(
      contextA,
      authorizationA,
      'POST',
      `/payment-reminders/invoices/${invoiceId}/send`,
      { stage: 3 },
    );
    expect(entity(duplicateResponse.body, 'result')).toMatchObject({ duplicate: true });
    expect(Number(queryScalar(`
      SELECT COUNT(*) FROM payment_reminder_attempts
      WHERE organisation_id = ${organisationA} AND invoice_id = ${invoiceId} AND stage = 3
    `))).toBe(1);

    await expect.poll(() => queryScalar(`
      SELECT status FROM payment_reminder_attempts
      WHERE organisation_id = ${organisationA} AND invoice_id = ${invoiceId} AND stage = 3
    `), { timeout: 90000, intervals: [1000, 2000, 5000] }).toBe('sent');

    const historyResponse = await apiRequest(contextA, authorizationA, 'GET', `/payment-reminders/history?invoice_id=${invoiceId}`);
    const history = entity(historyResponse.body, 'history');
    expect(history[0]).toMatchObject({ invoice_number: invoiceNumber, stage: 3, status: 'sent' });
    expect(history[0].sent_at).toBeTruthy();

    queryScalar(`
      UPDATE invoices SET status = 'paid', paid_at = NOW()
      WHERE id = ${invoiceId} AND organisation_id = ${organisationA}
      RETURNING id
    `);

    const afterPayment = entity(
      (await apiRequest(contextA, authorizationA, 'GET', '/payment-reminders/candidates')).body,
      'candidates',
    );
    expect(afterPayment.some((item) => Number(item.id) === Number(invoiceId))).toBe(false);

    const emailB = `${unique('reminders-b')}@example.com`;
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const authorizationB = await signup(pageB, {
      organisation: unique('Organisation-relances-B'),
      user: 'Administrateur Relances B',
      email: emailB,
      password,
    });

    const crossPreview = await contextB.request.get(`${apiUrl}/payment-reminders/invoices/${invoiceId}/preview?stage=3`, {
      headers: { authorization: authorizationB },
    });
    expect(crossPreview.status()).toBe(404);

    const crossSend = await contextB.request.post(`${apiUrl}/payment-reminders/invoices/${invoiceId}/send`, {
      headers: { authorization: authorizationB, 'content-type': 'application/json' },
      data: { stage: 3 },
    });
    expect(crossSend.status()).toBe(404);

    await contextA.close();
    await contextB.close();
  });
});
