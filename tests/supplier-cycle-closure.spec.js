const { test, expect } = require('@playwright/test');
const { apiUrl, signup, unique } = require('./helpers/auth');
const { queryScalar, sqlLiteral } = require('./helpers/finance');

async function post(request, path, authorization, data, headers = {}) {
  const response = await request.post(`${apiUrl}${path}`, {
    headers: { authorization, accept: 'application/json', 'content-type': 'application/json', ...headers },
    data,
  });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  expect(response.ok(), `${path}: ${text}`).toBeTruthy();
  return body?.data ?? body;
}

async function get(request, path, authorization) {
  const response = await request.get(`${apiUrl}${path}`, { headers: { authorization, accept: 'application/json' } });
  const body = await response.json();
  expect(response.ok(), `${path}: ${JSON.stringify(body)}`).toBeTruthy();
  return body?.data ?? body;
}

test.describe('Cycle fournisseurs complet', () => {
  test('dossier → conformité → rapprochement → approbation → paiement → performance → isolation', async ({ page, request }) => {
    const password = 'TestPassword123!';
    const emailA = `${unique('supplier-a')}@example.com`;
    const emailB = `${unique('supplier-b')}@example.com`;
    const authA = await signup(page, { organisation: unique('Organisation fournisseurs A'), user: 'Admin fournisseurs A', email: emailA, password });
    const orgA = queryScalar(`SELECT organisation_id FROM utilisateurs WHERE email=${sqlLiteral(emailA)} LIMIT 1`);
    expect(orgA).toMatch(/^\d+$/);

    const supplierKey = unique('supplier-key');
    const supplierPayload = {
      supplierNumber: unique('SUP'),
      legalName: unique('Fournisseur industriel'),
      tradeName: 'Partenaire E2E',
      category: 'matières premières',
      currency: 'CAD',
      language: 'fr-CA',
      paymentTerms: { days: 30 },
      taxIdentifiers: { gst: '123456789RT0001' },
      idempotencyKey: supplierKey,
    };
    const firstSupplier = await post(request, '/suppliers/master', authA, supplierPayload);
    const replaySupplier = await post(request, '/suppliers/master', authA, supplierPayload);
    const supplierId = firstSupplier.supplier?.id || firstSupplier.id;
    expect(String(supplierId)).toMatch(/^\d+$/);
    expect(String(replaySupplier.supplier?.id || replaySupplier.id)).toBe(String(supplierId));
    expect(queryScalar(`SELECT COUNT(*) FROM suppliers WHERE organisation_id=${orgA} AND idempotency_key=${sqlLiteral(supplierKey)}`)).toBe('1');

    await post(request, `/suppliers/master/${supplierId}/contacts`, authA, { contactType:'billing', name:'Camille Facturation', email:'camille@example.com', isPrimary:true });
    await post(request, `/suppliers/master/${supplierId}/addresses`, authA, { addressType:'billing', line1:'100 rue Test', city:'Montréal', region:'QC', postalCode:'H1H1H1', countryCode:'CA', isPrimary:true });
    await post(request, `/suppliers/master/${supplierId}/compliance-documents`, authA, { documentType:'assurance', documentNumber:'ASS-E2E', status:'valid', issuedAt:'2026-01-01', expiresAt:'2026-08-15' });

    const alerts = await get(request, '/suppliers/master/compliance-alerts?horizonDays=60', authA);
    expect((alerts.alerts || []).some((row) => String(row.supplier_id) === String(supplierId))).toBeTruthy();

    const orderId = queryScalar(`INSERT INTO inventory_purchase_orders
      (organisation_id,supplier_id,purchase_order_number,status,currency,subtotal,tax_total,total,idempotency_key,created_by)
      VALUES (${orgA},${supplierId},${sqlLiteral(unique('PO'))},'approved','CAD',100,14.98,114.98,${sqlLiteral(unique('po-key'))},
        (SELECT id FROM utilisateurs WHERE organisation_id=${orgA} ORDER BY id LIMIT 1)) RETURNING id`);
    const itemId = queryScalar(`INSERT INTO inventory_items (organisation_id,sku,name,cost,sale_price) VALUES (${orgA},${sqlLiteral(unique('SKU'))},'Article fournisseur',10,15) RETURNING id`);
    const orderLineId = queryScalar(`INSERT INTO inventory_purchase_order_lines
      (organisation_id,purchase_order_id,inventory_item_id,description,quantity,unit_cost,tax_rate,line_subtotal,line_tax,line_total)
      VALUES (${orgA},${orderId},${itemId},'Article fournisseur',10,10,0.14975,100,14.98,114.98) RETURNING id`);
    const receiptId = queryScalar(`INSERT INTO inventory_receipts
      (organisation_id,purchase_order_id,receipt_number,status,received_at,idempotency_key)
      VALUES (${orgA},${orderId},${sqlLiteral(unique('REC'))},'posted',NOW(),${sqlLiteral(unique('rec-key'))}) RETURNING id`);
    const receiptLineId = queryScalar(`INSERT INTO inventory_receipt_lines
      (organisation_id,receipt_id,purchase_order_line_id,inventory_item_id,quantity_received,unit_cost)
      VALUES (${orgA},${receiptId},${orderLineId},${itemId},10,10) RETURNING id`);

    const billId = queryScalar(`INSERT INTO supplier_bills
      (organisation_id,supplier_id,bill_number,bill_date,due_date,subtotal,tax_total,total,status,purchase_order_id,receipt_id,matching_status,matching_mode,idempotency_key)
      VALUES (${orgA},${supplierId},${sqlLiteral(unique('BILL'))},CURRENT_DATE,CURRENT_DATE+30,120,17.97,137.97,'draft',${orderId},${receiptId},'unmatched','three_way',${sqlLiteral(unique('bill-key'))}) RETURNING id`);
    queryScalar(`INSERT INTO supplier_bill_lines
      (organisation_id,supplier_bill_id,purchase_order_line_id,receipt_line_id,description,quantity,unit_price,tax_rate,subtotal,tax_total,total)
      VALUES (${orgA},${billId},${orderLineId},${receiptLineId},'Article fournisseur',10,12,0.14975,120,17.97,137.97) RETURNING id`);

    const matchingPolicy = await post(request, '/suppliers/master/matching/policies', authA, { name:unique('Politique stricte'),matchingMode:'three_way',priceTolerancePercent:2,quantityTolerancePercent:0,taxToleranceAmount:0.05,isDefault:true });
    const policyId = matchingPolicy.policy?.id;
    const matchKey = unique('match-key');
    const matchResult = await post(request, `/suppliers/master/matching/bills/${billId}/run`, authA, { policyId, idempotencyKey:matchKey }, { 'Idempotency-Key':matchKey });
    expect(matchResult.summary.exceptionCount).toBeGreaterThan(0);
    expect(queryScalar(`SELECT matching_status FROM supplier_bills WHERE organisation_id=${orgA} AND id=${billId}`)).toBe('exception');
    expect(Number(queryScalar(`SELECT COUNT(*) FROM supplier_matching_exceptions WHERE organisation_id=${orgA} AND supplier_bill_id=${billId} AND status='open'`))).toBeGreaterThan(0);

    const exceptionId = queryScalar(`SELECT id FROM supplier_matching_exceptions WHERE organisation_id=${orgA} AND supplier_bill_id=${billId} ORDER BY id LIMIT 1`);
    await post(request, `/suppliers/master/matching/exceptions/${exceptionId}/resolve`, authA, { status:'accepted',explanation:'Écart accepté par la direction avec preuve E2E.',evidence:[{ type:'approval',reference:'E2E' }] });
    expect(queryScalar(`SELECT status FROM supplier_matching_exceptions WHERE organisation_id=${orgA} AND id=${exceptionId}`)).toBe('accepted');

    queryScalar(`UPDATE supplier_bills SET matching_status='matched' WHERE organisation_id=${orgA} AND id=${billId} RETURNING id`);
    const approvalPolicy = await post(request, '/suppliers/master/matching/approval-payments/policies', authA, { name:unique('Approbation 100'),minimumAmount:100,requiredApprovals:1,requireDistinctRequester:true,requireDistinctPayer:true });
    const approvalRequest = await post(request, `/suppliers/master/matching/approval-payments/bills/${billId}/request`, authA, { policyId:approvalPolicy.policy.id,idempotencyKey:unique('approval-key') });
    const approvalId = approvalRequest.approval.id;

    const requesterId = queryScalar(`SELECT requested_by FROM supplier_bill_approvals WHERE organisation_id=${orgA} AND id=${approvalId}`);
    expect(requesterId).toMatch(/^\d+$/);
    const secondUserId = queryScalar(`INSERT INTO utilisateurs (organisation_id,nom,email,password,role)
      VALUES (${orgA},'Approbateur E2E',${sqlLiteral(`${unique('approver')}@example.com`)},'hash-e2e','admin') RETURNING id`);
    queryScalar(`UPDATE supplier_bill_approvals SET decided_by=${secondUserId},status='approved',decision_reason='Approuvé E2E',decided_at=NOW() WHERE organisation_id=${orgA} AND id=${approvalId} RETURNING id`);
    queryScalar(`UPDATE supplier_bills SET status='approved' WHERE organisation_id=${orgA} AND id=${billId} RETURNING id`);
    expect(secondUserId).not.toBe(requesterId);

    const batchKey = unique('batch-key');
    const batch = await post(request, '/suppliers/master/matching/approval-payments/batches', authA, {
      batchNumber:unique('PAY'),scheduledFor:'2026-07-30',currency:'CAD',idempotencyKey:batchKey,
      items:[{ billId:Number(billId),requestedAmount:137.97,earlyPaymentDiscount:2.97,withholdingAmount:5,paymentMethod:'eft' }],
    });
    expect(Number(batch.totals.netTotal)).toBe(130);
    expect(queryScalar(`SELECT net_total::text FROM supplier_payment_batches WHERE organisation_id=${orgA} AND idempotency_key=${sqlLiteral(batchKey)}`)).toMatch(/^130(\.0+)?$/);

    await post(request, '/suppliers/master/matching/approval-payments/performance/incidents', authA, {
      supplierId:Number(supplierId),incidentNumber:unique('INC'),incidentType:'quality',severity:'high',description:'Défaut de qualité E2E',occurredAt:new Date().toISOString(),
    });
    const snapshot = await post(request, `/suppliers/master/matching/approval-payments/performance/suppliers/${supplierId}/snapshots`, authA, { periodStart:'2026-07-01',periodEnd:'2026-07-31' });
    expect(Number(snapshot.snapshot.overall_score)).toBeGreaterThanOrEqual(0);
    expect(snapshot.snapshot.score_explanation).toBeTruthy();

    await page.goto('/suppliers');
    await expect(page.getByRole('heading', { name:'Fournisseurs' })).toBeVisible();
    await expect(page.getByText(/Calculé par le serveur/)).toBeVisible();
    await page.getByRole('button', { name:'Performance' }).click();
    await expect(page.getByRole('heading', { name:'Scores récents' })).toBeVisible();

    await page.context().clearCookies();
    const authB = await signup(page, { organisation: unique('Organisation fournisseurs B'), user:'Admin fournisseurs B', email:emailB, password });
    const orgB = queryScalar(`SELECT organisation_id FROM utilisateurs WHERE email=${sqlLiteral(emailB)} LIMIT 1`);
    expect(orgB).not.toBe(orgA);
    const suppliersB = await get(request, '/suppliers/master', authB);
    expect((suppliersB.suppliers || []).some((row) => String(row.id) === String(supplierId))).toBeFalsy();
    expect(queryScalar(`SELECT COUNT(*) FROM supplier_performance_snapshots WHERE organisation_id=${orgB} AND supplier_id=${supplierId}`)).toBe('0');
  });
});
