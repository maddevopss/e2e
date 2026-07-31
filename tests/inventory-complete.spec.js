const { test, expect } = require('@playwright/test');
const { makeTestPassword } = require('./helpers/credentials');
const { apiUrl, signup, unique } = require('./helpers/auth');
const { queryScalar, sqlLiteral } = require('./helpers/finance');

async function json(response) {
  const body = await response.json();
  return body?.data ?? body;
}

async function post(request, authorization, path, data) {
  const response = await request.post(`${apiUrl}${path}`, {
    headers: { authorization, accept: 'application/json', 'content-type': 'application/json' },
    data,
  });
  expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy();
  return json(response);
}

async function get(request, authorization, path) {
  const response = await request.get(`${apiUrl}${path}`, { headers: { authorization, accept: 'application/json' } });
  return { response, body: await json(response) };
}

test.describe('Inventaire — fermeture complète', () => {
  test('réception → réservation → comptage → achat → lot → valorisation → isolation', async ({ page, request }) => {
    const password = makeTestPassword();
    const emailA = `${unique('inventory-a')}@example.com`;
    const emailB = `${unique('inventory-b')}@example.com`;

    const authorizationA = await signup(page, {
      organisation: unique('Organisation-inventaire-A'),
      user: 'Administrateur Inventaire A',
      email: emailA,
      password,
    });
    const organisationA = queryScalar(`SELECT organisation_id FROM utilisateurs WHERE email=${sqlLiteral(emailA)} LIMIT 1`);
    expect(organisationA).toMatch(/^\d+$/);

    const authorizationB = await signup(page, {
      organisation: unique('Organisation-inventaire-B'),
      user: 'Administrateur Inventaire B',
      email: emailB,
      password,
    });
    const organisationB = queryScalar(`SELECT organisation_id FROM utilisateurs WHERE email=${sqlLiteral(emailB)} LIMIT 1`);
    expect(organisationB).toMatch(/^\d+$/);
    expect(organisationB).not.toBe(organisationA);

    const location = await post(request, authorizationA, '/inventory/locations', { code: 'MAIN', name: 'Entrepôt principal' });
    const secondary = await post(request, authorizationA, '/inventory/locations', { code: 'SEC', name: 'Entrepôt secondaire' });
    const item = await post(request, authorizationA, '/inventory/items', {
      sku: `SKU-${Date.now()}`,
      name: 'Pièce suivie',
      unit: 'unité',
      cost: 10,
      salePrice: 25,
      reorderPoint: 5,
      trackingMode: 'lot',
      expiryWarningDays: 30,
    });

    const itemId = item.item.id;
    const locationId = location.location.id;
    const secondaryId = secondary.location.id;

    const receiptKey = unique('receipt');
    const receipt = await post(request, authorizationA, '/inventory/receipts', {
      itemId,
      locationId,
      quantity: 20,
      unitCost: 10,
      reason: 'Stock initial E2E',
      referenceType: 'e2e',
      referenceId: 'initial-stock',
      idempotencyKey: receiptKey,
    });
    expect(receipt.inventoryTransaction || receipt.inventory_transaction).toBeTruthy();

    const replay = await post(request, authorizationA, '/inventory/receipts', {
      itemId,
      locationId,
      quantity: 20,
      unitCost: 10,
      reason: 'Stock initial E2E',
      referenceType: 'e2e',
      referenceId: 'initial-stock',
      idempotencyKey: receiptKey,
    });
    expect(replay.duplicate).toBe(true);
    expect(queryScalar(`SELECT COUNT(*) FROM inventory_transactions WHERE organisation_id=${organisationA} AND idempotency_key=${sqlLiteral(receiptKey)}`)).toBe('1');

    const reservationKey = unique('reservation');
    await post(request, authorizationA, '/inventory/reservations', {
      itemId,
      locationId,
      quantity: 4,
      referenceType: 'sales_order',
      referenceId: 'SO-E2E-1',
      idempotencyKey: reservationKey,
    });

    const availability = await get(request, authorizationA, `/inventory/availability?itemId=${itemId}&locationId=${locationId}`);
    expect(availability.response.ok()).toBeTruthy();
    const availableRow = (availability.body.availability || availability.body.balances || [])[0];
    expect(Number(availableRow.quantity_on_hand)).toBe(20);
    expect(Number(availableRow.quantity_reserved)).toBe(4);
    expect(Number(availableRow.quantity_available)).toBe(16);

    await post(request, authorizationA, '/inventory/transfers', {
      itemId,
      locationId,
      destinationLocationId: secondaryId,
      quantity: 3,
      reason: 'Transfert E2E',
      referenceType: 'e2e',
      referenceId: 'transfer-1',
      idempotencyKey: unique('transfer'),
    });
    expect(queryScalar(`SELECT COUNT(*) FROM accounting_entries WHERE organisation_id=${organisationA} AND source_type='inventory_transaction' AND description ILIKE '%transfer%'`)).toBe('0');

    const countSession = await post(request, authorizationA, '/inventory/count-sessions', {
      locationId,
      code: unique('COUNT'),
      freezeMovements: false,
      notes: 'Comptage E2E',
    });
    const sessionId = countSession.session.id;
    await post(request, authorizationA, `/inventory/count-sessions/${sessionId}/lines`, { itemId, countedQuantity: 18, note: 'Écart constaté' });
    await post(request, authorizationA, `/inventory/count-sessions/${sessionId}/submit`, {});

    const approverEmail = `${unique('inventory-approver')}@example.com`;
    queryScalar(`INSERT INTO utilisateurs (organisation_id,nom,email,password_hash,role) VALUES (${organisationA},'Approbateur inventaire',${sqlLiteral(approverEmail)},'e2e','admin') RETURNING id`);
    const approverId = queryScalar(`SELECT id FROM utilisateurs WHERE email=${sqlLiteral(approverEmail)} LIMIT 1`);
    expect(approverId).toMatch(/^\d+$/);

    const sessionSubmittedBy = queryScalar(`SELECT submitted_by FROM inventory_count_sessions WHERE organisation_id=${organisationA} AND id=${sessionId}`);
    expect(sessionSubmittedBy).not.toBe(approverId);

    const supplierId = queryScalar(`INSERT INTO suppliers (organisation_id,name,payment_terms_days,address) VALUES (${organisationA},'Fournisseur E2E',30,'{}'::jsonb) RETURNING id`);
    const order = await post(request, authorizationA, '/inventory/procurement/purchase-orders', {
      supplierId: Number(supplierId),
      purchaseOrderNumber: unique('PO'),
      expectedAt: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      idempotencyKey: unique('po-key'),
      lines: [{ inventoryItemId: itemId, description: 'Pièce suivie', quantity: 10, unitCost: 11, taxRate: 0.14975 }],
    });
    const orderId = order.purchaseOrder.id;
    await post(request, authorizationA, `/inventory/procurement/purchase-orders/${orderId}/approve`, {});
    await post(request, authorizationA, `/inventory/procurement/purchase-orders/${orderId}/receipts`, {
      receiptNumber: unique('REC'),
      idempotencyKey: unique('receipt-po'),
      lines: [{ purchaseOrderLineId: order.lines[0].id, locationId, quantity: 4, rejectedQuantity: 0 }],
    });
    expect(queryScalar(`SELECT status FROM procurement_purchase_orders WHERE organisation_id=${organisationA} AND id=${orderId}`)).toBe('partially_received');

    const lotNumber = unique('LOT');
    const expiresAt = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
    const trackedReceipt = await post(request, authorizationA, '/inventory/traceability/receipts', {
      itemId,
      locationId,
      quantity: 2,
      unitCost: 12,
      lotNumber,
      expiresAt,
      referenceType: 'e2e',
      referenceId: 'lot-receipt',
      idempotencyKey: unique('lot-receipt'),
    });
    const lotId = trackedReceipt.lot.id;
    await post(request, authorizationA, `/inventory/traceability/lots/${lotId}/quarantine`, { reason: 'Inspection E2E', idempotencyKey: unique('quarantine') });

    const blockedIssue = await request.post(`${apiUrl}/inventory/traceability/issues`, {
      headers: { authorization: authorizationA, accept: 'application/json', 'content-type': 'application/json' },
      data: { itemId, locationId, lotId, quantity: 1, referenceType: 'e2e', referenceId: 'blocked', idempotencyKey: unique('blocked-issue') },
    });
    expect(blockedIssue.status()).toBe(409);

    const expiryAlerts = await get(request, authorizationA, '/inventory/traceability/expiry-alerts?days=30');
    expect(expiryAlerts.response.ok()).toBeTruthy();
    expect((expiryAlerts.body.alerts || []).some((row) => Number(row.id) === Number(lotId))).toBe(true);

    const valuation = await get(request, authorizationA, '/inventory/analytics/valuation');
    expect(valuation.response.ok()).toBeTruthy();
    expect(Number(valuation.body.valuation?.inventory_value || valuation.body.inventory_value || 0)).toBeGreaterThan(0);

    const replenishment = await get(request, authorizationA, '/inventory/analytics/replenishment');
    expect(replenishment.response.ok()).toBeTruthy();
    expect(replenishment.body.replenishment || replenishment.body).toBeTruthy();

    const forbiddenItem = await get(request, authorizationB, `/inventory/availability?itemId=${itemId}&locationId=${locationId}`);
    expect(forbiddenItem.response.ok()).toBeTruthy();
    expect((forbiddenItem.body.availability || forbiddenItem.body.balances || [])).toHaveLength(0);

    const crossTenantLot = await get(request, authorizationB, `/inventory/traceability/events?lotId=${lotId}`);
    expect(crossTenantLot.response.ok()).toBeTruthy();
    expect(crossTenantLot.body.events || []).toHaveLength(0);

    await page.goto('/inventory');
    await expect(page.getByRole('heading', { name: 'Inventaire' })).toBeVisible();
    await expect(page.getByText('Pièce suivie')).toBeVisible();
    await page.getByRole('button', { name: 'Analyse' }).click();
    await expect(page.getByRole('heading', { name: 'Réapprovisionnement' })).toBeVisible();
  });
});
