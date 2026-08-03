const { test, expect } = require('@playwright/test');

const API_URL = process.env.TEST_API_URL || process.env.BACKEND_URL || process.env.API_URL || 'http://127.0.0.1:5000/api';
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('cycle complet gestion financière avancée', () => {
  test.skip(!email || !password, 'Identifiants E2E requis.');

  test('budget (approbation indépendante), prévision (publication indépendante), position de trésorerie, facilité de financement et scénario', async ({ request }) => {
    const suffix = Date.now();
    const login = await request.post(`${API_URL}/login`, { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    const loginBody = await login.json();
    const token = loginBody?.data?.token || loginBody?.token;
    const headers = { Authorization: `Bearer ${token}` };
    const withKey = (key) => ({ ...headers, 'Idempotency-Key': `e2e-fin-${suffix}-${key}` });

    // --- Budget : refus sans clé d'idempotence, puis création et refus d'approbation par le même propriétaire ---
    const missingKeyBudgetResponse = await request.post(`${API_URL}/finance/budgets`, {
      headers,
      data: { budgetNumber: `BUD-${suffix}`, name: 'Budget 2026', fiscalYear: 2026 },
    });
    expect(missingKeyBudgetResponse.status()).toBe(400);

    const budgetResponse = await request.post(`${API_URL}/finance/budgets`, {
      headers: withKey('bud'),
      data: { budgetNumber: `BUD-${suffix}`, name: 'Budget 2026', fiscalYear: 2026, totalRevenue: 500000, totalExpense: 400000, allocations: [{ category: 'paie', amount: 200000 }], assumptions: ['croissance 5%'] },
    });
    expect(budgetResponse.ok()).toBeTruthy();
    const budget = (await budgetResponse.json()).data;
    expect(budget.status).toBe('draft');

    // Le propriétaire du budget (utilisateur 1) ne peut pas être son propre approbateur — comparaison
    // qui doit tolérer que owner_user_id revienne en bigint (chaîne) de la base alors que
    // approvedByUserId est un nombre JSON fourni par le client.
    const badApproveResponse = await request.post(`${API_URL}/finance/budgets/${budget.id}/approve`, {
      headers: withKey('ap-bad'),
      data: { approvedByUserId: 1, approvalEvidence: ['pv.pdf'] },
    });
    expect(badApproveResponse.status()).toBe(409);

    const approveResponse = await request.post(`${API_URL}/finance/budgets/${budget.id}/approve`, {
      headers: withKey('ap'),
      data: { approvedByUserId: 2, approvalEvidence: ['pv.pdf'] },
    });
    expect(approveResponse.ok()).toBeTruthy();
    expect((await approveResponse.json()).data.status).toBe('approved');

    // --- Prévision : refus sans clé d'idempotence, puis création et refus de publication par le même préparateur ---
    const missingKeyForecastResponse = await request.post(`${API_URL}/finance/forecasts`, {
      headers,
      data: { forecastNumber: `FC-${suffix}`, name: 'Prévision T3', periodStart: '2026-07-01', periodEnd: '2026-09-30' },
    });
    expect(missingKeyForecastResponse.status()).toBe(400);

    const forecastResponse = await request.post(`${API_URL}/finance/forecasts`, {
      headers: withKey('fc'),
      data: { forecastNumber: `FC-${suffix}`, name: 'Prévision T3', periodStart: '2026-07-01', periodEnd: '2026-09-30', forecastData: { revenue: 150000 }, assumptions: ['stabilité des coûts'], risks: ['inflation'] },
    });
    expect(forecastResponse.ok()).toBeTruthy();
    const forecast = (await forecastResponse.json()).data;

    const badPublishResponse = await request.post(`${API_URL}/finance/forecasts/${forecast.id}/publish`, {
      headers: withKey('pub-bad'),
      data: { approvedByUserId: 1, approvalEvidence: ['revue.pdf'] },
    });
    expect(badPublishResponse.status()).toBe(409);

    const publishResponse = await request.post(`${API_URL}/finance/forecasts/${forecast.id}/publish`, {
      headers: withKey('pub'),
      data: { approvedByUserId: 2, approvalEvidence: ['revue.pdf'] },
    });
    expect(publishResponse.ok()).toBeTruthy();
    expect((await publishResponse.json()).data.status).toBe('published');

    // --- Position de trésorerie : refus si la réconciliation échoue, puis position valide ---
    const badCashPositionResponse = await request.post(`${API_URL}/finance/cash-positions`, {
      headers: withKey('cp-bad'),
      data: { positionDate: '2026-06-30', accountReference: `BANQUE-${suffix}`, openingBalance: 10000, inflows: 5000, outflows: 2000, closingBalance: 99999, sourceEvidence: ['relevé.pdf'] },
    });
    expect(badCashPositionResponse.status()).toBe(409);

    const cashPositionResponse = await request.post(`${API_URL}/finance/cash-positions`, {
      headers: withKey('cp'),
      data: { positionDate: '2026-06-30', accountReference: `BANQUE-${suffix}`, openingBalance: 10000, inflows: 5000, outflows: 2000, closingBalance: 13000, sourceEvidence: ['relevé.pdf'] },
    });
    expect(cashPositionResponse.ok()).toBeTruthy();

    // --- Facilité de financement ---
    const facilityResponse = await request.post(`${API_URL}/finance/funding-facilities`, {
      headers: withKey('ff'),
      data: { facilityNumber: `FF-${suffix}`, facilityType: 'line_of_credit', providerName: 'Banque Nationale', approvedLimit: 50000, drawnAmount: 10000, startsAt: '2026-01-01', maturesAt: '2027-01-01', covenants: ['ratio dette/actif < 2'], evidence: ['contrat.pdf'] },
    });
    expect(facilityResponse.ok()).toBeTruthy();
    expect((await facilityResponse.json()).data.status).toBe('active');

    // --- Scénario financier : refus sans clé d'idempotence, puis création et refus d'approbation par le même préparateur ---
    const missingKeyScenarioResponse = await request.post(`${API_URL}/finance/scenarios`, {
      headers,
      data: { scenarioNumber: `SC-${suffix}`, name: 'Récession', scenarioType: 'stress_test' },
    });
    expect(missingKeyScenarioResponse.status()).toBe(400);

    const scenarioResponse = await request.post(`${API_URL}/finance/scenarios`, {
      headers: withKey('sc'),
      data: { scenarioNumber: `SC-${suffix}`, name: 'Récession', scenarioType: 'stress_test', assumptions: ['baisse de 20% des ventes'], projectedResults: { cashRunway: 6 }, risks: ['insolvabilité'], recommendations: ['réduire les coûts fixes'] },
    });
    expect(scenarioResponse.ok()).toBeTruthy();
    const scenario = (await scenarioResponse.json()).data;

    const badScenarioApproveResponse = await request.post(`${API_URL}/finance/scenarios/${scenario.id}/approve`, {
      headers: withKey('sc-ap-bad'),
      data: { approvedByUserId: 1, approvalEvidence: ['revue.pdf'] },
    });
    expect(badScenarioApproveResponse.status()).toBe(409);

    const scenarioApproveResponse = await request.post(`${API_URL}/finance/scenarios/${scenario.id}/approve`, {
      headers: withKey('sc-ap'),
      data: { approvedByUserId: 2, approvalEvidence: ['revue.pdf'] },
    });
    expect(scenarioApproveResponse.ok()).toBeTruthy();
    expect((await scenarioApproveResponse.json()).data.status).toBe('approved');

    // --- Listes et alertes ---
    const budgetsListResponse = await request.get(`${API_URL}/finance/budgets`, { headers });
    expect(budgetsListResponse.ok()).toBeTruthy();
    expect((await budgetsListResponse.json()).data.some((b) => b.id === budget.id)).toBe(true);

    const alertsResponse = await request.get(`${API_URL}/finance/alerts`, { headers });
    expect(alertsResponse.ok()).toBeTruthy();
    const alerts = (await alertsResponse.json()).data;
    expect(alerts).toHaveProperty('facilitiesExpiring');
    expect(alerts).toHaveProperty('negativeCashPositions');
  });
});
