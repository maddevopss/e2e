const { test, expect } = require('@playwright/test');

const API_URL = process.env.TEST_API_URL || process.env.BACKEND_URL || process.env.API_URL || 'http://127.0.0.1:5000/api';
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('cycle complet gouvernance des données et vie privée', () => {
  test.skip(!email || !password, 'Identifiants E2E requis.');

  test('activité de traitement, consentement, demande de sujet, incident (avec fermeture) et action de rétention', async ({ request }) => {
    const suffix = Date.now();
    const login = await request.post(`${API_URL}/login`, { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    const loginBody = await login.json();
    const token = loginBody?.data?.token || loginBody?.token;
    const headers = { Authorization: `Bearer ${token}` };
    const withKey = (key) => ({ ...headers, 'Idempotency-Key': `e2e-privacy-${suffix}-${key}` });

    // --- Activité de traitement : refus sans catégories de données/sujets, puis création valide ---
    const badActivityResponse = await request.post(`${API_URL}/privacy/processing-activities`, {
      headers: withKey('pa-bad'),
      data: { activityNumber: `PA-${suffix}`, name: 'Paie', purpose: 'Traitement paie', legalBasis: 'contract', nextReviewAt: '2027-01-01', retentionPeriodDays: 365 },
    });
    expect(badActivityResponse.status()).toBe(409);

    const activityResponse = await request.post(`${API_URL}/privacy/processing-activities`, {
      headers: withKey('pa'),
      data: { activityNumber: `PA-${suffix}`, name: 'Paie', purpose: 'Traitement paie', legalBasis: 'contract', nextReviewAt: '2027-01-01', retentionPeriodDays: 365, dataCategories: ['nom', 'salaire'], subjectCategories: ['employés'], recipients: ['comptabilité'], evidence: ['registre.pdf'] },
    });
    expect(activityResponse.ok()).toBeTruthy();
    const activity = (await activityResponse.json()).data;
    expect(activity.status).toBe('active');
    expect(activity.data_categories).toEqual(['nom', 'salaire']);

    // --- Consentement : refus si accordé sans preuve, puis enregistrement valide ---
    const badConsentResponse = await request.post(`${API_URL}/privacy/consents`, {
      headers: withKey('cons-bad'),
      data: { subjectReference: 'client-42', purpose: 'marketing', source: 'formulaire web' },
    });
    expect(badConsentResponse.status()).toBe(409);

    const consentResponse = await request.post(`${API_URL}/privacy/consents`, {
      headers: withKey('cons'),
      data: { subjectReference: 'client-42', purpose: 'marketing', source: 'formulaire web', proof: ['consentement.pdf'] },
    });
    expect(consentResponse.ok()).toBeTruthy();
    expect((await consentResponse.json()).data.status).toBe('granted');

    // --- Demande d'un sujet de données : ouverture, puis refus si complétée directement sans preuve ---
    const requestResponse = await request.post(`${API_URL}/privacy/requests`, {
      headers: withKey('req'),
      data: { requestNumber: `SR-${suffix}`, requestType: 'access', subjectReference: 'client-42', dueAt: '2026-09-01' },
    });
    expect(requestResponse.ok()).toBeTruthy();
    expect((await requestResponse.json()).data.status).toBe('open');

    const badCompletedRequestResponse = await request.post(`${API_URL}/privacy/requests`, {
      headers: withKey('req-comp-bad'),
      data: { requestNumber: `SR-${suffix}-bad`, requestType: 'access', subjectReference: 'client-99', dueAt: '2026-09-01', status: 'completed', identityVerification: ['pièce-identité'] },
    });
    expect(badCompletedRequestResponse.status()).toBe(409);

    // --- Incident : refus si sévérité élevée sans journal de décision, puis enregistrement valide et fermeture ---
    const badIncidentResponse = await request.post(`${API_URL}/privacy/incidents`, {
      headers: withKey('inc-bad'),
      data: { incidentNumber: `PI-${suffix}`, title: 'Fuite', description: 'Fuite de données', severity: 'high' },
    });
    expect(badIncidentResponse.status()).toBe(409);

    const incidentResponse = await request.post(`${API_URL}/privacy/incidents`, {
      headers: withKey('inc'),
      data: {
        incidentNumber: `PI-${suffix}`,
        title: 'Fuite',
        description: 'Fuite de données clients',
        severity: 'high',
        affectedData: ['courriels'],
        affectedSubjectsEstimate: 50,
        containmentActions: ['réinitialisation mots de passe'],
        decisionLog: ['décision de notifier'],
        notificationRequired: true,
        notificationDecisionReason: 'seuil dépassé',
        evidence: ['rapport-incident.pdf'],
      },
    });
    expect(incidentResponse.ok()).toBeTruthy();
    const incident = (await incidentResponse.json()).data;
    expect(incident.status).toBe('open');
    expect(incident.decision_log).toEqual(['décision de notifier']);

    const closeIncidentResponse = await request.post(`${API_URL}/privacy/incidents/${incident.id}/close`, {
      headers: withKey('close'),
      data: { rootCause: 'Erreur de configuration', lessonsLearned: 'Ajouter revue de config', evidence: ['postmortem.pdf'] },
    });
    expect(closeIncidentResponse.ok()).toBeTruthy();
    const closedIncident = (await closeIncidentResponse.json()).data;
    expect(closedIncident.status).toBe('closed');
    expect(closedIncident.root_cause).toBe('Erreur de configuration');

    // --- Action de rétention rattachée à l'activité de traitement ---
    const badRetentionResponse = await request.post(`${API_URL}/privacy/retention-actions`, {
      headers: withKey('ret-bad'),
      data: { processingActivityId: activity.id, actionNumber: `RA-${suffix}-bad`, actionType: 'delete', dueAt: '2026-12-31', status: 'completed' },
    });
    expect(badRetentionResponse.status()).toBe(409);

    const retentionResponse = await request.post(`${API_URL}/privacy/retention-actions`, {
      headers: withKey('ret'),
      data: { processingActivityId: activity.id, actionNumber: `RA-${suffix}`, actionType: 'delete', dueAt: '2026-12-31', evidence: ['plan-purge.pdf'] },
    });
    expect(retentionResponse.ok()).toBeTruthy();
    const retention = (await retentionResponse.json()).data;
    expect(retention.status).toBe('planned');
    expect(retention.evidence).toEqual(['plan-purge.pdf']);

    // --- Listes et alertes ---
    const activitiesListResponse = await request.get(`${API_URL}/privacy/processing-activities`, { headers });
    expect(activitiesListResponse.ok()).toBeTruthy();
    expect((await activitiesListResponse.json()).data.some((a) => a.id === activity.id)).toBe(true);

    const alertsResponse = await request.get(`${API_URL}/privacy/alerts`, { headers });
    expect(alertsResponse.ok()).toBeTruthy();
    expect(Array.isArray((await alertsResponse.json()).data)).toBe(true);
  });
});
