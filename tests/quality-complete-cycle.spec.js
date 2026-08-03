const { test, expect } = require('@playwright/test');

const API_URL = process.env.TEST_API_URL || process.env.BACKEND_URL || process.env.API_URL || 'http://127.0.0.1:5000/api';
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('cycle qualité (plans, inspections, non-conformités, actions correctives, audits)', () => {
  test.skip(!email || !password, 'Identifiants E2E requis.');

  test('création complète et traçabilité plan → inspection → non-conformité → action corrective, audit et alertes', async ({ request }) => {
    const suffix = Date.now();
    const login = await request.post(`${API_URL}/login`, { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    const loginBody = await login.json();
    const token = loginBody?.data?.token || loginBody?.token;
    const headers = { Authorization: `Bearer ${token}` };
    const withKey = (key) => ({ ...headers, 'Idempotency-Key': `e2e-quality-${suffix}-${key}` });

    // Une création sans clé d'idempotence doit être refusée (toutes les entités qualité l'exigent).
    const missingKeyResponse = await request.post(`${API_URL}/quality/plans`, {
      headers,
      data: { code: `QP-${suffix}`, title: 'Plan sans clé', scopeType: 'product', version: '1.0', acceptanceCriteria: ['a'] },
    });
    expect(missingKeyResponse.status()).toBe(400);

    // --- Plan de contrôle qualité ---
    const planResponse = await request.post(`${API_URL}/quality/plans`, {
      headers: withKey('plan'),
      data: {
        code: `QP-${suffix}`,
        title: 'Plan de contrôle E2E',
        scopeType: 'product',
        version: '1.0',
        samplingMethod: 'AQL',
        acceptanceCriteria: ['critère 1', 'critère 2'],
        checklist: ['étape 1'],
        evidenceRequirements: ['photo'],
      },
    });
    expect(planResponse.ok()).toBeTruthy();
    const plan = (await planResponse.json()).data;
    expect(plan.status).toBe('draft');
    expect(plan.acceptance_criteria).toEqual(['critère 1', 'critère 2']);
    expect(plan.checklist).toEqual(['étape 1']);

    // --- Inspection rattachée au plan, résultat rejeté avec constats et preuve ---
    const inspectionResponse = await request.post(`${API_URL}/quality/inspections`, {
      headers: withKey('inspection'),
      data: {
        inspectionNumber: `QI-${suffix}`,
        planId: plan.id,
        subjectType: 'lot',
        subjectId: 42,
        lotNumber: 'L-42',
        sampleSize: 10,
        acceptedQuantity: 7,
        rejectedQuantity: 3,
        result: 'rejected',
        findings: ['défaut visuel'],
        evidence: ['photo1.jpg'],
        reason: 'Trop de défauts',
      },
    });
    expect(inspectionResponse.ok()).toBeTruthy();
    const inspection = (await inspectionResponse.json()).data;
    expect(inspection.result).toBe('rejected');
    expect(String(inspection.plan_id)).toBe(String(plan.id));
    expect(inspection.findings).toEqual(['défaut visuel']);
    expect(inspection.evidence).toEqual(['photo1.jpg']);

    // --- Non-conformité rattachée à l'inspection ---
    const nonconformityResponse = await request.post(`${API_URL}/quality/nonconformities`, {
      headers: withKey('nc'),
      data: {
        nonconformityNumber: `NC-${suffix}`,
        inspectionId: inspection.id,
        sourceType: 'inspection',
        sourceId: inspection.id,
        title: 'Défaut visuel récurrent',
        description: 'Description de la non-conformité',
        severity: 'high',
        evidence: ['photo2.jpg'],
      },
    });
    expect(nonconformityResponse.ok()).toBeTruthy();
    const nonconformity = (await nonconformityResponse.json()).data;
    expect(nonconformity.status).toBe('open');
    expect(String(nonconformity.inspection_id)).toBe(String(inspection.id));
    expect(nonconformity.evidence).toEqual(['photo2.jpg']);

    // --- Action corrective rattachée à la non-conformité ---
    const actionResponse = await request.post(`${API_URL}/quality/actions`, {
      headers: withKey('action'),
      data: {
        actionNumber: `CA-${suffix}`,
        nonconformityId: nonconformity.id,
        actionType: 'corrective',
        description: 'Réviser le processus de contrôle',
      },
    });
    expect(actionResponse.ok()).toBeTruthy();
    const action = (await actionResponse.json()).data;
    expect(action.status).toBe('open');
    expect(String(action.nonconformity_id)).toBe(String(nonconformity.id));

    // --- Audit qualité ---
    const auditResponse = await request.post(`${API_URL}/quality/audits`, {
      headers: withKey('audit'),
      data: {
        auditNumber: `AUD-${suffix}`,
        auditType: 'internal',
        scope: 'Ligne de production A',
        standardReference: 'ISO9001',
      },
    });
    expect(auditResponse.ok()).toBeTruthy();
    const audit = (await auditResponse.json()).data;
    expect(audit.status).toBe('planned');

    // --- Listes et alertes ---
    const plansListResponse = await request.get(`${API_URL}/quality/plans`, { headers });
    expect(plansListResponse.ok()).toBeTruthy();
    expect((await plansListResponse.json()).data.some((p) => p.id === plan.id)).toBe(true);

    const inspectionsListResponse = await request.get(`${API_URL}/quality/inspections`, { headers });
    expect(inspectionsListResponse.ok()).toBeTruthy();
    expect((await inspectionsListResponse.json()).data.some((i) => i.id === inspection.id)).toBe(true);

    const alertsResponse = await request.get(`${API_URL}/quality/alerts`, { headers });
    expect(alertsResponse.ok()).toBeTruthy();
    const alerts = (await alertsResponse.json()).data;
    expect(alerts).toHaveProperty('nonconformities');
    expect(alerts).toHaveProperty('actions');
    expect(alerts).toHaveProperty('audits');
    expect(alerts).toHaveProperty('planReviews');
  });
});
