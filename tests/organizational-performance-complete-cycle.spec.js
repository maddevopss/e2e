const { test, expect } = require('@playwright/test');

const API_URL = process.env.TEST_API_URL || process.env.BACKEND_URL || process.env.API_URL || 'http://127.0.0.1:5000/api';
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('cycle complet performance organisationnelle', () => {
  test.skip(!email || !password, 'Identifiants E2E requis.');

  test('objectif (approbation indépendante), indicateur, mesure, revue et plan d’amélioration', async ({ request }) => {
    const suffix = Date.now();
    const login = await request.post(`${API_URL}/login`, { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    const loginBody = await login.json();
    const token = loginBody?.data?.token || loginBody?.token;
    const headers = { Authorization: `Bearer ${token}` };
    const withKey = (key) => ({ ...headers, 'Idempotency-Key': `e2e-perf-${suffix}-${key}` });

    // --- Objectif stratégique : refus sans gouvernance, puis création valide ---
    const badObjectiveResponse = await request.post(`${API_URL}/performance/objectives`, {
      headers: withKey('o-bad'),
      data: { objectiveNumber: `OBJ-${suffix}`, title: 'Réduire les coûts', description: 'Réduction des coûts opérationnels' },
    });
    expect(badObjectiveResponse.status()).toBe(400);

    const objectiveResponse = await request.post(`${API_URL}/performance/objectives`, {
      headers: withKey('obj'),
      data: { objectiveNumber: `OBJ-${suffix}`, title: 'Réduire les coûts', description: 'Réduction des coûts opérationnels', ownerUserId: 1, periodStart: '2026-01-01', periodEnd: '2026-12-31', perspective: 'financial', target: 100000, unit: 'CAD' },
    });
    expect(objectiveResponse.ok()).toBeTruthy();
    const objective = (await objectiveResponse.json()).data;
    expect(objective.status).toBe('draft');

    // --- Approbation : refus si propriétaire == approbateur, puis approbation indépendante ---
    const badApproveResponse = await request.post(`${API_URL}/performance/objectives/${objective.id}/approve`, {
      headers: withKey('ap-bad'),
      data: { approvedByUserId: 1, approvalReason: 'Validé' },
    });
    expect(badApproveResponse.status()).toBe(409);

    const approveResponse = await request.post(`${API_URL}/performance/objectives/${objective.id}/approve`, {
      headers: withKey('ap'),
      data: { approvedByUserId: 2, approvalReason: 'Validé par le CFO' },
    });
    expect(approveResponse.ok()).toBeTruthy();
    expect((await approveResponse.json()).data.status).toBe('active');

    // --- Indicateur de performance ---
    const indicatorResponse = await request.post(`${API_URL}/performance/indicators`, {
      headers: withKey('ind'),
      data: { objectiveId: objective.id, indicatorNumber: `KPI-${suffix}`, name: 'Coût opérationnel mensuel', definition: 'Somme des coûts opérationnels', formula: 'SUM(costs)', sourceSystem: 'ERP', direction: 'lower_is_better', frequency: 'monthly', unit: 'CAD', target: 8000 },
    });
    expect(indicatorResponse.ok()).toBeTruthy();
    const indicator = (await indicatorResponse.json()).data;

    // --- Mesure : refus si statut d'alerte sans commentaire, puis mesure valide ---
    const badMeasurementResponse = await request.post(`${API_URL}/performance/measurements`, {
      headers: withKey('m-bad'),
      data: { indicatorId: indicator.id, measuredAt: '2026-06-01', value: 9500, status: 'warning', sourceReference: 'rapport-mensuel' },
    });
    expect(badMeasurementResponse.status()).toBe(409);

    const measurementResponse = await request.post(`${API_URL}/performance/measurements`, {
      headers: withKey('m'),
      data: { indicatorId: indicator.id, measuredAt: '2026-06-01', value: 9500, status: 'warning', sourceReference: 'rapport-mensuel', commentary: 'Dépassement dû à inflation fournisseur', evidence: ['rapport.pdf'] },
    });
    expect(measurementResponse.ok()).toBeTruthy();
    expect((await measurementResponse.json()).data.evidence).toEqual(['rapport.pdf']);

    // --- Revue de performance : refus si hors cible sans décisions, puis revue valide ---
    const badReviewResponse = await request.post(`${API_URL}/performance/reviews`, {
      headers: withKey('r-bad'),
      data: { objectiveId: objective.id, reviewNumber: `REV-${suffix}`, reviewDate: '2026-06-15', overallStatus: 'off_track', analysis: 'Dépassement budgétaire', evidence: ['analyse.pdf'], nextReviewAt: '2026-09-01' },
    });
    expect(badReviewResponse.status()).toBe(409);

    const reviewResponse = await request.post(`${API_URL}/performance/reviews`, {
      headers: withKey('r'),
      data: { objectiveId: objective.id, reviewNumber: `REV-${suffix}`, reviewDate: '2026-06-15', overallStatus: 'off_track', analysis: 'Dépassement budgétaire', decisions: ["lancer plan d'amélioration"], evidence: ['analyse.pdf'], nextReviewAt: '2026-09-01' },
    });
    expect(reviewResponse.ok()).toBeTruthy();
    expect((await reviewResponse.json()).data.decisions).toEqual(["lancer plan d'amélioration"]);

    // --- Plan d'amélioration et transition ---
    const planResponse = await request.post(`${API_URL}/performance/improvement-plans`, {
      headers,
      data: { objectiveId: objective.id, indicatorId: indicator.id, planNumber: `IMP-${suffix}`, title: 'Réduire coûts fournisseurs', rootCause: 'Renégociation manquante', actionPlan: ['renégocier contrats'], ownerUserId: 1, dueAt: '2026-09-01' },
    });
    expect(planResponse.ok()).toBeTruthy();
    const plan = (await planResponse.json()).data;
    expect(plan.status).toBe('open');

    const transitionResponse = await request.post(`${API_URL}/performance/improvement-plans/${plan.id}/transition`, {
      headers: withKey('t1'),
      data: { action: 'implemented', implementationResult: 'Nouveaux contrats signés', implementationEvidence: ['contrats.pdf'] },
    });
    expect(transitionResponse.ok()).toBeTruthy();
    expect((await transitionResponse.json()).data.status).toBe('implemented');

    // --- Listes et alertes ---
    const objectivesListResponse = await request.get(`${API_URL}/performance/objectives`, { headers });
    expect(objectivesListResponse.ok()).toBeTruthy();
    expect((await objectivesListResponse.json()).data.some((o) => o.id === objective.id)).toBe(true);

    const alertsResponse = await request.get(`${API_URL}/performance/alerts`, { headers });
    expect(alertsResponse.ok()).toBeTruthy();
    expect(Array.isArray((await alertsResponse.json()).data)).toBe(true);
  });
});
