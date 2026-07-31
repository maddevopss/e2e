const { test, expect } = require('@playwright/test');
const { makeTestPassword } = require('./helpers/credentials');
const { apiUrl, apiRequest, entity, signup, unique } = require('./helpers/auth');
const { queryScalar, sqlLiteral } = require('./helpers/finance');

function tokenFromPortalUrl(portalUrl) {
  return String(portalUrl || '').split('/portal/')[1]?.split(/[?#]/)[0] || '';
}

async function publicJson(context, method, path, data) {
  const response = await context.request.fetch(`${apiUrl}${path}`, {
    method,
    headers: data ? { 'content-type': 'application/json' } : undefined,
    data,
  });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch (_) {}
  return { response, body, text };
}

test.describe('Soumissions publiques sécurisées V1', () => {
  test('rotation, décision signée, conversion unique, révocation et isolation', async ({ browser }) => {
    const password = makeTestPassword();
    const emailA = `${unique('estimate-portal-a')}@example.com`;
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const authorizationA = await signup(pageA, {
      organisation: unique('Organisation-soumission-A'),
      user: 'Administrateur Soumission A',
      email: emailA,
      password,
    });

    const organisationA = queryScalar(`SELECT organisation_id FROM utilisateurs WHERE email = ${sqlLiteral(emailA)} LIMIT 1`);
    const clientId = queryScalar(`
      INSERT INTO clients (organisation_id, nom, email)
      VALUES (${organisationA}, ${sqlLiteral(unique('Client-soumission'))}, ${sqlLiteral(`${unique('client-estimate')}@example.com`)})
      RETURNING id
    `);
    const estimateNumber = `SOU-${Date.now()}`;
    const estimateId = queryScalar(`
      INSERT INTO estimates
        (organisation_id, client_id, estimate_number, status, issue_date, valid_until,
         subtotal, tax_total, total, notes, created_at)
      VALUES
        (${organisationA}, ${clientId}, ${sqlLiteral(estimateNumber)}, 'sent', CURRENT_DATE,
         CURRENT_DATE + INTERVAL '30 days', 100, 14.98, 114.98,
         ${sqlLiteral('Soumission sécurisée')}, NOW())
      RETURNING id
    `);
    queryScalar(`
      INSERT INTO estimate_items
        (organisation_id, estimate_id, description, quantity, unit_rate, amount)
      VALUES (${organisationA}, ${estimateId}, ${sqlLiteral('Développement')}, 2, 50, 100)
      RETURNING id
    `);
    const oldUuid = queryScalar(`SELECT public_token FROM estimates WHERE id = ${estimateId}`);

    const firstLink = await apiRequest(contextA, authorizationA, 'POST', `/portal/manage/estimates/${estimateId}`, {
      expires_in_days: 30,
    });
    const firstLinkData = entity(firstLink.body, 'data');
    const firstToken = tokenFromPortalUrl(firstLinkData.portalUrl || firstLinkData.portal_url);
    expect(firstToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const secondLink = await apiRequest(contextA, authorizationA, 'POST', `/portal/manage/estimates/${estimateId}`, {
      expires_in_days: 30,
    });
    const secondLinkData = entity(secondLink.body, 'data');
    const secondToken = tokenFromPortalUrl(secondLinkData.portalUrl || secondLinkData.portal_url);
    expect(secondToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(secondToken).not.toBe(firstToken);

    const oldRotated = await publicJson(contextA, 'GET', `/portal/${firstToken}`);
    expect(oldRotated.response.status()).toBe(404);

    const oldUuidResponse = await publicJson(contextA, 'GET', `/portal/${oldUuid}`);
    expect(oldUuidResponse.response.status()).toBe(404);

    const publicDocument = await publicJson(contextA, 'GET', `/portal/${secondToken}`);
    expect(publicDocument.response.status()).toBe(200);
    expect(publicDocument.body).toMatchObject({
      type: 'estimate',
      document: {
        estimate_number: estimateNumber,
        status: 'sent',
        total: expect.anything(),
        client: { name: expect.any(String) },
      },
    });
    expect(publicDocument.body.document).not.toHaveProperty('id');
    expect(publicDocument.body.document).not.toHaveProperty('organisation_id');
    expect(publicDocument.body.document).not.toHaveProperty('client_id');
    expect(publicDocument.body.document).not.toHaveProperty('public_token');

    const missingConsent = await publicJson(contextA, 'POST', `/portal/${secondToken}/action`, {
      action: 'accepted',
      signer_name: 'Client Signataire',
      consent_confirmed: false,
    });
    expect(missingConsent.response.status()).toBe(400);

    const accepted = await publicJson(contextA, 'POST', `/portal/${secondToken}/action`, {
      action: 'accepted',
      signer_name: 'Client Signataire',
      consent_confirmed: true,
    });
    expect(accepted.response.status()).toBe(200);
    expect(accepted.body.decision).toMatchObject({ duplicate: false });
    expect(queryScalar(`SELECT status FROM estimates WHERE id = ${estimateId}`)).toBe('accepted');
    expect(queryScalar(`SELECT signer_name FROM estimate_public_decisions WHERE estimate_id = ${estimateId}`)).toBe('Client Signataire');

    const acceptedAgain = await publicJson(contextA, 'POST', `/portal/${secondToken}/action`, {
      action: 'accepted',
      signer_name: 'Client Signataire',
      consent_confirmed: true,
    });
    expect(acceptedAgain.response.status()).toBe(200);
    expect(acceptedAgain.body.decision).toMatchObject({ duplicate: true });
    expect(Number(queryScalar(`SELECT COUNT(*) FROM estimate_public_decisions WHERE estimate_id = ${estimateId}`))).toBe(1);

    const contradictory = await publicJson(contextA, 'POST', `/portal/${secondToken}/action`, {
      action: 'rejected',
      signer_name: 'Client Signataire',
      consent_confirmed: false,
    });
    expect(contradictory.response.status()).toBe(409);

    const conversionKey = `estimate-convert-${Date.now()}`;
    const converted = await apiRequest(contextA, authorizationA, 'POST', `/estimates/${estimateId}/convert`, {
      idempotency_key: conversionKey,
    });
    const invoice = entity(converted.body, 'invoice');
    expect(invoice.id).toBeTruthy();

    const replayed = await apiRequest(contextA, authorizationA, 'POST', `/estimates/${estimateId}/convert`, {
      idempotency_key: conversionKey,
    });
    expect(Number(entity(replayed.body, 'invoice').id)).toBe(Number(invoice.id));
    expect(Number(queryScalar(`SELECT COUNT(*) FROM invoices WHERE estimate_id = ${estimateId} AND deleted_at IS NULL`))).toBe(1);

    await apiRequest(contextA, authorizationA, 'DELETE', `/portal/manage/estimates/${estimateId}`);
    const revoked = await publicJson(contextA, 'GET', `/portal/${secondToken}`);
    expect(revoked.response.status()).toBe(404);

    const rejectedNumber = `SOU-REF-${Date.now()}`;
    const rejectedId = queryScalar(`
      INSERT INTO estimates
        (organisation_id, client_id, estimate_number, status, issue_date, valid_until,
         subtotal, tax_total, total, created_at)
      VALUES (${organisationA}, ${clientId}, ${sqlLiteral(rejectedNumber)}, 'sent', CURRENT_DATE,
              CURRENT_DATE + INTERVAL '30 days', 50, 0, 50, NOW())
      RETURNING id
    `);
    const rejectedLink = await apiRequest(contextA, authorizationA, 'POST', `/portal/manage/estimates/${rejectedId}`, {});
    const rejectedToken = tokenFromPortalUrl(entity(rejectedLink.body, 'data').portalUrl);
    const rejection = await publicJson(contextA, 'POST', `/portal/${rejectedToken}/action`, {
      action: 'rejected',
      signer_name: 'Client Refus',
      consent_confirmed: false,
    });
    expect(rejection.response.status()).toBe(200);
    expect(queryScalar(`SELECT status FROM estimates WHERE id = ${rejectedId}`)).toBe('rejected');

    const rejectedConversion = await contextA.request.post(`${apiUrl}/estimates/${rejectedId}/convert`, {
      headers: { authorization: authorizationA, 'content-type': 'application/json' },
      data: { idempotency_key: `rejected-${Date.now()}` },
    });
    expect(rejectedConversion.status()).toBe(400);

    const emailB = `${unique('estimate-portal-b')}@example.com`;
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const authorizationB = await signup(pageB, {
      organisation: unique('Organisation-soumission-B'),
      user: 'Administrateur Soumission B',
      email: emailB,
      password,
    });

    const crossCreate = await contextB.request.post(`${apiUrl}/portal/manage/estimates/${estimateId}`, {
      headers: { authorization: authorizationB, 'content-type': 'application/json' },
      data: { expires_in_days: 30 },
    });
    expect(crossCreate.status()).toBe(404);

    await contextA.close();
    await contextB.close();
  });
});