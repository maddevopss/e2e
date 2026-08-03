const { test, expect } = require('@playwright/test');

const API_URL = process.env.TEST_API_URL || process.env.BACKEND_URL || process.env.API_URL || 'http://127.0.0.1:5000/api';
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('cycle complet actifs et entretien', () => {
  test.skip(!email || !password, 'Identifiants E2E requis.');

  test('actif, plan, demande, bon de travail (main-d’œuvre, pièces, remise en service, complétion, vérification) et relevé d’usage', async ({ request }) => {
    const suffix = Date.now();
    const login = await request.post(`${API_URL}/login`, { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    const loginBody = await login.json();
    const token = loginBody?.data?.token || loginBody?.token;
    const headers = { Authorization: `Bearer ${token}` };
    const withKey = (key) => ({ ...headers, 'Idempotency-Key': `e2e-asset-${suffix}-${key}` });

    // --- Fiche d'actif ---
    const assetResponse = await request.post(`${API_URL}/assets/records`, {
      headers,
      data: {
        assetCode: `AST-${suffix}`,
        name: 'Compresseur E2E',
        assetType: 'equipment',
        acquiredAt: '2025-01-01',
        acquisitionCost: 5000,
        residualValue: 500,
        metadata: { site: 'Usine A' },
        evidence: ['facture.pdf'],
      },
    });
    expect(assetResponse.ok()).toBeTruthy();
    const asset = (await assetResponse.json()).data;
    expect(asset.status).toBe('active');
    expect(asset.metadata).toEqual({ site: 'Usine A' });

    // --- Plan d'entretien préventif ---
    const planResponse = await request.post(`${API_URL}/assets/plans`, {
      headers,
      data: { assetId: asset.id, name: 'Entretien préventif', maintenanceType: 'preventive', intervalDays: 90, checklist: ['vérifier huile'], requiredEvidence: ['photo'] },
    });
    expect(planResponse.ok()).toBeTruthy();
    const plan = (await planResponse.json()).data;
    expect(plan.checklist).toEqual(['vérifier huile']);

    // --- Demande d'entretien : refus sans clé d'idempotence, puis création ---
    const missingKeyRequestResponse = await request.post(`${API_URL}/assets/requests`, {
      headers,
      data: { assetId: asset.id, requestNumber: `REQ-${suffix}`, summary: 'Bruit anormal' },
    });
    expect(missingKeyRequestResponse.status()).toBe(400);

    const requestResponse = await request.post(`${API_URL}/assets/requests`, {
      headers: withKey('req'),
      data: { assetId: asset.id, requestNumber: `REQ-${suffix}`, summary: 'Bruit anormal', description: 'Bruit fort au démarrage', priority: 'high', evidence: ['audio.mp3'] },
    });
    expect(requestResponse.ok()).toBeTruthy();
    const maintenanceRequest = (await requestResponse.json()).data;
    expect(maintenanceRequest.status).toBe('reported');

    // --- Bon de travail rattaché à la demande ---
    const workOrderResponse = await request.post(`${API_URL}/assets/work-orders`, {
      headers: withKey('wo'),
      data: { assetId: asset.id, maintenanceRequestId: maintenanceRequest.id, workOrderNumber: `WO-${suffix}`, workType: 'corrective', priority: 'high', description: 'Diagnostiquer le bruit' },
    });
    expect(workOrderResponse.ok()).toBeTruthy();
    const workOrder = (await workOrderResponse.json()).data;
    expect(workOrder.status).toBe('open');

    // --- Passage en cours ---
    const inProgressResponse = await request.post(`${API_URL}/assets/work-orders/${workOrder.id}/in_progress`, {
      headers: withKey('inprog'),
      data: {},
    });
    expect(inProgressResponse.ok()).toBeTruthy();
    expect((await inProgressResponse.json()).data.workOrder.status).toBe('in_progress');

    // --- Main-d'œuvre et pièces (routes littérales, doivent rester atteignables malgré la route générique /:id/:action) ---
    const labourResponse = await request.post(`${API_URL}/assets/work-orders/${workOrder.id}/labour`, {
      headers,
      data: { startedAt: '2026-08-01T09:00:00Z', endedAt: '2026-08-01T11:00:00Z', minutesWorked: 120, hourlyCost: 50, evidence: ['rapport.pdf'] },
    });
    expect(labourResponse.ok()).toBeTruthy();
    expect((await labourResponse.json()).data.evidence).toEqual(['rapport.pdf']);

    const partsResponse = await request.post(`${API_URL}/assets/work-orders/${workOrder.id}/parts`, {
      headers,
      data: { partNumber: 'BLT-42', description: 'Courroie de transmission', quantity: 1, unitCost: 75, evidence: ['facture-piece.pdf'] },
    });
    expect(partsResponse.ok()).toBeTruthy();
    expect((await partsResponse.json()).data.evidence).toEqual(['facture-piece.pdf']);

    // --- Remise en service ---
    const returnToServiceResponse = await request.post(`${API_URL}/assets/work-orders/${workOrder.id}/return-to-service`, {
      headers,
      data: { safeToOperate: true, checklist: ['vérifier fixation'], evidence: ['photo-finale.jpg'] },
    });
    expect(returnToServiceResponse.ok()).toBeTruthy();
    const returnToService = (await returnToServiceResponse.json()).data;
    expect(returnToService.safe_to_operate).toBe(true);

    // --- Complétion : refus sans preuve, puis complétion avec preuve/raison ---
    const badCompleteResponse = await request.post(`${API_URL}/assets/work-orders/${workOrder.id}/completed`, {
      headers: withKey('comp-bad'),
      data: { reason: 'Réparé' },
    });
    expect(badCompleteResponse.status()).toBe(400);

    const completeResponse = await request.post(`${API_URL}/assets/work-orders/${workOrder.id}/completed`, {
      headers: withKey('comp'),
      data: { reason: 'Réparé et testé', evidence: ['photo-reparation.jpg'], findings: ['courroie usée'] },
    });
    expect(completeResponse.ok()).toBeTruthy();
    const completed = (await completeResponse.json()).data.workOrder;
    expect(completed.status).toBe('completed');
    expect(completed.completion_reason).toBe('Réparé et testé');
    expect(completed.findings).toEqual(['courroie usée']);

    // --- Vérification ---
    const verifyResponse = await request.post(`${API_URL}/assets/work-orders/${workOrder.id}/verified`, {
      headers: withKey('verify'),
      data: { evidence: ['verification.pdf'] },
    });
    expect(verifyResponse.ok()).toBeTruthy();
    expect((await verifyResponse.json()).data.workOrder.status).toBe('verified');

    // La fermeture exige un diagnostic et une résolution consignés sur le bon de travail ;
    // aucune route actuelle ne permet de les renseigner, donc la fermeture doit rester bloquée (409).
    const closeResponse = await request.post(`${API_URL}/assets/work-orders/${workOrder.id}/close`, {
      headers,
      data: { reason: 'Terminé' },
    });
    expect(closeResponse.status()).toBe(409);

    // --- Relevé d'usage ---
    const readingResponse = await request.post(`${API_URL}/assets/records/${asset.id}/readings`, {
      headers,
      data: { readingValue: 1200, readingUnit: 'heures', measuredAt: '2026-08-01', evidence: ['compteur.jpg'] },
    });
    expect(readingResponse.ok()).toBeTruthy();
    expect((await readingResponse.json()).data.evidence).toEqual(['compteur.jpg']);

    // --- Listes et alertes ---
    const recordsListResponse = await request.get(`${API_URL}/assets/records`, { headers });
    expect(recordsListResponse.ok()).toBeTruthy();
    expect((await recordsListResponse.json()).data.some((a) => a.id === asset.id)).toBe(true);

    const alertsResponse = await request.get(`${API_URL}/assets/alerts`, { headers });
    expect(alertsResponse.ok()).toBeTruthy();
    const alerts = (await alertsResponse.json()).data;
    expect(alerts).toHaveProperty('maintenancePlans');
    expect(alerts).toHaveProperty('overdueWorkOrders');
    expect(alerts).toHaveProperty('expiringWarranties');
    expect(alerts).toHaveProperty('outOfServiceAssets');
  });
});
