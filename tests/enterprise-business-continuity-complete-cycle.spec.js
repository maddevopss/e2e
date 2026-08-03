const { test, expect } = require('@playwright/test');

const API_URL = process.env.TEST_API_URL || process.env.BACKEND_URL || process.env.API_URL || 'http://127.0.0.1:5000/api';
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('cycle complet continuité des activités (BCM)', () => {
  test.skip(!email || !password, 'Identifiants E2E requis.');

  test('processus critique, dépendance, plan (création et activation), procédure, exercice, événement majeur et revue', async ({ request }) => {
    const suffix = Date.now();
    const login = await request.post(`${API_URL}/login`, { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    const loginBody = await login.json();
    const token = loginBody?.data?.token || loginBody?.token;
    const headers = { Authorization: `Bearer ${token}` };
    const withKey = (key) => ({ ...headers, 'Idempotency-Key': `e2e-bcm-${suffix}-${key}` });

    // --- Processus métier critique : refus si RTO > MTD, puis création valide ---
    const badProcessResponse = await request.post(`${API_URL}/business-continuity/processes`, {
      headers: withKey('p-bad'),
      data: { processNumber: `BP-${suffix}`, name: 'Paie', description: 'Traitement de la paie', maximumTolerableDowntimeMinutes: 60, recoveryTimeObjectiveMinutes: 120, nextReviewAt: '2027-01-01' },
    });
    expect(badProcessResponse.status()).toBe(409);

    const processResponse = await request.post(`${API_URL}/business-continuity/processes`, {
      headers: withKey('p'),
      data: { processNumber: `BP-${suffix}`, name: 'Paie', description: 'Traitement de la paie', maximumTolerableDowntimeMinutes: 240, recoveryTimeObjectiveMinutes: 120, nextReviewAt: '2027-01-01', evidence: ['analyse-impact.pdf'] },
    });
    expect(processResponse.ok()).toBeTruthy();
    const process = (await processResponse.json()).data;
    expect(process.status).toBe('active');

    // --- Dépendance : refus sans clé d'idempotence, puis création valide ---
    const missingKeyDepResponse = await request.post(`${API_URL}/business-continuity/dependencies`, {
      headers,
      data: { processId: process.id, dependencyType: 'software', dependencyReference: 'SAP', description: 'ERP paie' },
    });
    expect(missingKeyDepResponse.status()).toBe(400);

    const dependencyResponse = await request.post(`${API_URL}/business-continuity/dependencies`, {
      headers: withKey('dep'),
      data: { processId: process.id, dependencyType: 'software', dependencyReference: 'SAP', description: 'ERP paie', fallbackDescription: 'Traitement manuel', evidence: ['cartographie.pdf'] },
    });
    expect(dependencyResponse.ok()).toBeTruthy();

    // --- Plan de continuité et activation (refus sans raison d'activation) ---
    const planResponse = await request.post(`${API_URL}/business-continuity/plans`, {
      headers: withKey('plan'),
      data: { processId: process.id, planNumber: `PCA-${suffix}`, title: 'Plan de continuité paie', scenario: 'Panne ERP', activationConditions: 'ERP indisponible plus de 2h', nextReviewAt: '2027-01-01', procedures: ['basculer sur site secondaire'], resources: ['équipe paie de secours'], evidence: ['plan-signé.pdf'] },
    });
    expect(planResponse.ok()).toBeTruthy();
    const plan = (await planResponse.json()).data;
    expect(plan.status).toBe('draft');

    const badActivateResponse = await request.post(`${API_URL}/business-continuity/plans/${plan.id}/activate`, {
      headers: withKey('act-bad'),
      data: { evidence: ['déclenchement.pdf'] },
    });
    expect(badActivateResponse.status()).toBe(409);

    const activateResponse = await request.post(`${API_URL}/business-continuity/plans/${plan.id}/activate`, {
      headers: withKey('act'),
      data: { evidence: ['déclenchement.pdf'], activationReason: 'Panne ERP confirmée' },
    });
    expect(activateResponse.ok()).toBeTruthy();
    expect((await activateResponse.json()).data.status).toBe('active');

    // --- Procédure de reprise : refus sans clé d'idempotence, puis création valide ---
    const missingKeyProcResponse = await request.post(`${API_URL}/business-continuity/procedures`, {
      headers,
      data: { planId: plan.id, procedureNumber: `REC-${suffix}`, title: 'Basculer sur site secondaire' },
    });
    expect(missingKeyProcResponse.status()).toBe(400);

    const procedureResponse = await request.post(`${API_URL}/business-continuity/procedures`, {
      headers: withKey('proc'),
      data: { planId: plan.id, procedureNumber: `REC-${suffix}`, title: 'Basculer sur site secondaire', steps: ['activer VPN', 'connecter ERP secondaire'], expectedDurationMinutes: 30, evidence: ['procedure.pdf'] },
    });
    expect(procedureResponse.ok()).toBeTruthy();
    expect((await procedureResponse.json()).data.steps).toEqual(['activer VPN', 'connecter ERP secondaire']);

    // --- Exercice de simulation ---
    const exerciseResponse = await request.post(`${API_URL}/business-continuity/exercises`, {
      headers: withKey('ex'),
      data: { planId: plan.id, exerciseNumber: `EX-${suffix}`, scenario: 'Simulation panne ERP', result: 'successful', conclusion: 'Plan efficace', observations: ['délai respecté'], improvements: ['ajouter contact secondaire'], evidence: ['rapport-exercice.pdf'] },
    });
    expect(exerciseResponse.ok()).toBeTruthy();
    expect((await exerciseResponse.json()).data.result).toBe('successful');

    // --- Événement majeur réel : refus sans journal de décision, puis enregistrement et fermeture ---
    const badEventResponse = await request.post(`${API_URL}/business-continuity/events`, {
      headers: withKey('ev-bad'),
      data: { eventNumber: `EV-${suffix}`, title: 'Panne ERP réelle', description: 'ERP hors service' },
    });
    expect(badEventResponse.status()).toBe(409);

    const eventResponse = await request.post(`${API_URL}/business-continuity/events`, {
      headers: withKey('ev'),
      data: { planId: plan.id, eventNumber: `EV-${suffix}`, title: 'Panne ERP réelle', description: 'ERP hors service', severity: 'critical', decisionLog: ['activation du plan'], evidence: ['journal-incident.pdf'] },
    });
    expect(eventResponse.ok()).toBeTruthy();
    const event = (await eventResponse.json()).data;
    expect(event.status).toBe('active');

    const closeEventResponse = await request.post(`${API_URL}/business-continuity/events/${event.id}/close`, {
      headers: withKey('close'),
      data: { lessonsLearned: 'Améliorer la redondance ERP', evidence: ['postmortem.pdf'] },
    });
    expect(closeEventResponse.ok()).toBeTruthy();
    expect((await closeEventResponse.json()).data.status).toBe('closed');

    // --- Revue du plan ---
    const reviewResponse = await request.post(`${API_URL}/business-continuity/reviews`, {
      headers: withKey('rev'),
      data: { planId: plan.id, reviewNumber: `REV-${suffix}`, conclusion: 'Plan toujours pertinent', nextReviewAt: '2027-06-01', evidence: ['pv-revue.pdf'] },
    });
    expect(reviewResponse.ok()).toBeTruthy();

    // --- Listes et alertes ---
    const processesListResponse = await request.get(`${API_URL}/business-continuity/processes`, { headers });
    expect(processesListResponse.ok()).toBeTruthy();
    expect((await processesListResponse.json()).data.some((p) => p.id === process.id)).toBe(true);

    const alertsResponse = await request.get(`${API_URL}/business-continuity/alerts`, { headers });
    expect(alertsResponse.ok()).toBeTruthy();
    expect(Array.isArray((await alertsResponse.json()).data)).toBe(true);
  });
});
