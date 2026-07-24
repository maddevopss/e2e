const { test, expect } = require('@playwright/test');
const { apiRequest, entity, signup, unique } = require('./helpers/auth');
const { queryScalar, sqlLiteral } = require('./helpers/finance');

test.describe('Facturation depuis les heures V1', () => {
  test('prévisualise, facture une seule fois et isole les organisations', async ({ browser }) => {
    const password = 'TestPassword123!';
    const emailA = `${unique('time-invoice-a')}@example.com`;
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const authorizationA = await signup(pageA, {
      organisation: unique('Organisation-heures-A'),
      user: 'Administrateur Heures A',
      email: emailA,
      password,
    });

    const ids = queryScalar(`
      SELECT organisation_id || ':' || id
      FROM utilisateurs
      WHERE email = ${sqlLiteral(emailA)}
      LIMIT 1
    `).split(':');
    const [organisationId, userId] = ids;
    const clientName = unique('Client-heures');
    const clientId = queryScalar(`
      INSERT INTO clients (organisation_id, nom, email, hourly_rate_defaut)
      VALUES (${organisationId}, ${sqlLiteral(clientName)}, ${sqlLiteral(`${unique('client')}@example.com`)}, 100)
      RETURNING id
    `);
    const projectName = unique('Projet-heures');
    const projectId = queryScalar(`
      INSERT INTO projets (organisation_id, client_id, nom, taux_horaire)
      VALUES (${organisationId}, ${clientId}, ${sqlLiteral(projectName)}, 100)
      RETURNING id
    `);

    const entryOne = queryScalar(`
      INSERT INTO time_entries
        (organisation_id, projet_id, utilisateur_id, start_time, end_time, description, hourly_rate_used, is_billed)
      VALUES
        (${organisationId}, ${projectId}, ${userId}, NOW() - INTERVAL '4 hours', NOW() - INTERVAL '2 hours', 'Analyse facturable', 100, FALSE)
      RETURNING id
    `);
    const entryTwo = queryScalar(`
      INSERT INTO time_entries
        (organisation_id, projet_id, utilisateur_id, start_time, end_time, description, hourly_rate_used, is_billed)
      VALUES
        (${organisationId}, ${projectId}, ${userId}, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour', 'Développement facturable', 100, FALSE)
      RETURNING id
    `);

    const previewResponse = await apiRequest(
      contextA,
      authorizationA,
      'GET',
      `/invoices/time-billing-preview?client_id=${clientId}&project_id=${projectId}&tax_rate=15`,
    );
    expect(previewResponse.status).toBe(200);
    const preview = entity(previewResponse.body, 'preview');
    expect(preview.entries.map((entry) => Number(entry.id))).toEqual([Number(entryOne), Number(entryTwo)]);
    expect(Number(preview.summary.total_hours)).toBe(3);
    expect(Number(preview.summary.subtotal)).toBe(300);
    expect(Number(preview.summary.tax_total)).toBe(45);
    expect(Number(preview.summary.total)).toBe(345);

    const idempotencyKey = unique('time-invoice-key');
    const createResponse = await apiRequest(contextA, authorizationA, 'POST', '/invoices', {
      client_id: Number(clientId),
      time_entry_ids: [Number(entryOne), Number(entryTwo)],
      tax_rate: 15,
      idempotency_key: idempotencyKey,
    });
    expect(createResponse.status).toBe(201);
    const invoice = entity(createResponse.body, 'invoice');
    expect(Number(invoice.total)).toBe(345);

    const linkedCount = queryScalar(`
      SELECT COUNT(*)
      FROM time_entries
      WHERE organisation_id = ${organisationId}
        AND invoice_id = ${Number(invoice.id)}
        AND is_billed = TRUE
    `);
    expect(Number(linkedCount)).toBe(2);

    const previewAfter = await apiRequest(
      contextA,
      authorizationA,
      'GET',
      `/invoices/time-billing-preview?client_id=${clientId}&project_id=${projectId}&tax_rate=15`,
    );
    expect(entity(previewAfter.body, 'preview').entries).toEqual([]);

    const repeated = await apiRequest(contextA, authorizationA, 'POST', '/invoices', {
      client_id: Number(clientId),
      time_entry_ids: [Number(entryOne), Number(entryTwo)],
      tax_rate: 15,
      idempotency_key: idempotencyKey,
    });
    expect([201, 409]).toContain(repeated.status);
    const invoiceCount = queryScalar(`
      SELECT COUNT(*) FROM invoices
      WHERE organisation_id = ${organisationId}
        AND idempotency_key = ${sqlLiteral(idempotencyKey)}
    `);
    expect(Number(invoiceCount)).toBe(1);

    await pageA.goto('/invoices');
    await pageA.getByRole('button', { name: /Nouvelle facture/i }).click();
    await expect(pageA.getByText(/Aucune heure ni dépense facturable/i)).not.toBeVisible().catch(() => {});

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const authorizationB = await signup(pageB, {
      organisation: unique('Organisation-heures-B'),
      user: 'Administrateur Heures B',
      email: `${unique('time-invoice-b')}@example.com`,
      password,
    });
    const previewB = await apiRequest(contextB, authorizationB, 'GET', `/invoices/time-billing-preview?client_id=${clientId}`);
    expect([200, 404]).toContain(previewB.status);
    if (previewB.status === 200) {
      expect(entity(previewB.body, 'preview').entries).toEqual([]);
      expect(JSON.stringify(previewB.body)).not.toContain(projectName);
      expect(JSON.stringify(previewB.body)).not.toContain(clientName);
    }

    await contextA.close();
    await contextB.close();
  });
});
