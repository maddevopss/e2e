const { test, expect } = require('@playwright/test');
const { makeTestPassword } = require('./helpers/credentials');
const { apiUrl, apiRequest, entity, signup, unique } = require('./helpers/auth');
const { queryScalar, sqlLiteral } = require('./helpers/finance');

test.describe('Portail public de facture et PDF V1', () => {
  test('lien opaque, PDF, révocation et isolation restent cohérents', async ({ browser, request }) => {
    const password = makeTestPassword();
    const emailA = `${unique('portal-a')}@example.com`;
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const authorizationA = await signup(pageA, {
      organisation: unique('Organisation-portail-A'),
      user: 'Administrateur Portail A',
      email: emailA,
      password,
    });

    const organisationA = queryScalar(`
      SELECT organisation_id
      FROM utilisateurs
      WHERE email = ${sqlLiteral(emailA)}
      LIMIT 1
    `);
    const clientName = unique('Client-portail');
    const clientId = queryScalar(`
      INSERT INTO clients (organisation_id, nom, email)
      VALUES (${organisationA}, ${sqlLiteral(clientName)}, ${sqlLiteral(`${unique('client')}@example.com`)})
      RETURNING id
    `);
    const invoiceNumber = `PORTAL-${Date.now()}`;
    const invoiceId = queryScalar(`
      INSERT INTO invoices
        (organisation_id, client_id, invoice_number, status, issue_date, due_date,
         subtotal, tax_total, total, finalized_at, snapshot, created_at)
      VALUES
        (${organisationA}, ${clientId}, ${sqlLiteral(invoiceNumber)}, 'finalized', CURRENT_DATE,
         CURRENT_DATE + INTERVAL '30 days', 100, 15, 115, NOW(),
         ${sqlLiteral(JSON.stringify({ subtotal: 100, tax_total: 15, total: 115, items: [] }))}::jsonb,
         NOW())
      RETURNING id
    `);
    queryScalar(`
      INSERT INTO invoice_items
        (organisation_id, invoice_id, description, quantity, unit_rate, amount, created_at)
      VALUES
        (${organisationA}, ${invoiceId}, 'Service portail sécurisé', 2, 50, 100, NOW())
      RETURNING id
    `);

    const created = await apiRequest(
      contextA,
      authorizationA,
      'POST',
      `/portal/manage/invoices/${invoiceId}`,
      { expires_in_days: 30 },
    );
    const link = entity(created.body, 'link');
    expect(link.portalUrl).toMatch(/\/portal\/[A-Za-z0-9_-]{43}$/);
    expect(link.expires_at).toBeTruthy();
    const token = link.portalUrl.split('/').pop();

    const publicResponse = await request.get(`${apiUrl}/portal/${token}`);
    expect(publicResponse.status(), await publicResponse.text()).toBe(200);
    expect(publicResponse.headers()['cache-control']).toContain('no-store');
    expect(publicResponse.headers()['x-robots-tag']).toContain('noindex');
    const publicBody = await publicResponse.json();
    expect(publicBody.type).toBe('invoice');
    expect(publicBody.document).toMatchObject({
      invoice_number: invoiceNumber,
      status: 'finalized',
      subtotal: '100.00',
      tax_total: '15.00',
      total: '115.00',
    });
    expect(publicBody.document.client.name).toBe(clientName);
    expect(publicBody.document.items[0]).toMatchObject({
      description: 'Service portail sécurisé',
      quantity: '2.00',
      unit_rate: '50.00',
      amount: '100.00',
    });
    expect(JSON.stringify(publicBody)).not.toContain('organisation_id');
    expect(JSON.stringify(publicBody)).not.toContain('client_id');
    expect(JSON.stringify(publicBody)).not.toContain('time_entry_id');

    const pdf = await request.get(`${apiUrl}/portal/${token}/pdf`);
    expect(pdf.status(), await pdf.text()).toBe(200);
    expect(pdf.headers()['content-type']).toContain('application/pdf');
    expect(pdf.headers()['content-disposition']).toMatch(/attachment; filename="[A-Za-z0-9._-]+\.pdf"/);
    const pdfBytes = await pdf.body();
    expect(pdfBytes.slice(0, 4).toString()).toBe('%PDF');

    const secondLinkResponse = await apiRequest(
      contextA,
      authorizationA,
      'POST',
      `/portal/manage/invoices/${invoiceId}`,
      { expires_in_days: 7 },
    );
    const secondLink = entity(secondLinkResponse.body, 'link');
    const secondToken = secondLink.portalUrl.split('/').pop();
    expect(secondToken).not.toBe(token);
    expect((await request.get(`${apiUrl}/portal/${token}`)).status()).toBe(404);
    expect((await request.get(`${apiUrl}/portal/${secondToken}`)).status()).toBe(200);

    const emailB = `${unique('portal-b')}@example.com`;
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const authorizationB = await signup(pageB, {
      organisation: unique('Organisation-portail-B'),
      user: 'Administrateur Portail B',
      email: emailB,
      password,
    });

    const crossOrg = await contextB.request.post(`${apiUrl}/portal/manage/invoices/${invoiceId}`, {
      headers: {
        authorization: authorizationB,
        'content-type': 'application/json',
      },
      data: { expires_in_days: 30 },
    });
    expect(crossOrg.status()).toBe(404);

    const revoked = await apiRequest(
      contextA,
      authorizationA,
      'DELETE',
      `/portal/manage/invoices/${invoiceId}`,
    );
    expect(entity(revoked.body, 'result').revoked).toBe(true);
    expect((await request.get(`${apiUrl}/portal/${secondToken}`)).status()).toBe(404);
    expect((await request.get(`${apiUrl}/portal/${'x'.repeat(43)}`)).status()).toBe(404);

    const draftInvoiceId = queryScalar(`
      INSERT INTO invoices
        (organisation_id, client_id, invoice_number, status, issue_date, subtotal, tax_total, total, created_at)
      VALUES
        (${organisationA}, ${clientId}, ${sqlLiteral(`DRAFT-${Date.now()}`)}, 'draft', CURRENT_DATE, 10, 0, 10, NOW())
      RETURNING id
    `);
    const draftLink = await contextA.request.post(`${apiUrl}/portal/manage/invoices/${draftInvoiceId}`, {
      headers: {
        authorization: authorizationA,
        'content-type': 'application/json',
      },
      data: { expires_in_days: 30 },
    });
    expect(draftLink.status()).toBe(409);

    await contextA.close();
    await contextB.close();
  });
});
