const { test, expect } = require('@playwright/test');

const API_URL = process.env.TEST_API_URL || process.env.BACKEND_URL || process.env.API_URL || 'http://127.0.0.1:5000/api';
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('cycle complet résilience institutionnelle', () => {
  test.skip(!email || !password, 'Identifiants E2E requis.');

  test('événement majeur, cellule de crise, décision, communication, chronologie, exercice, leçon et amélioration', async ({ request }) => {
    const suffix = Date.now();
    const login = await request.post(`${API_URL}/login`, { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    const loginBody = await login.json();
    const token = loginBody?.data?.token || loginBody?.token;
    const headers = { Authorization: `Bearer ${token}` };
    const withKey = (key) => ({ ...headers, 'Idempotency-Key': `e2e-resilience-${suffix}-${key}` });

    // --- Événement : refus sans justification/preuve, puis ouverture valide ---
    const badEventResponse = await request.post(`${API_URL}/resilience/events`, {
      headers: withKey('ev-bad'),
      data: { eventType: 'outage', title: 'Panne majeure', severity: 'critical' },
    });
    expect(badEventResponse.status()).toBe(409);

    const eventResponse = await request.post(`${API_URL}/resilience/events`, {
      headers: withKey('ev'),
      data: { eventType: 'outage', title: 'Panne majeure', severity: 'critical', ownerUserId: 1, justification: 'Panne serveur central', proofReference: 'incident-log-42' },
    });
    expect(eventResponse.ok()).toBeTruthy();
    const event = (await eventResponse.json()).data;
    expect(event.status).toBe('open');

    // --- Cellule de crise ---
    const crisisCellResponse = await request.post(`${API_URL}/resilience/crisis-cells`, {
      headers: withKey('cell'),
      data: { eventId: event.id, leadUserId: 1, mandate: 'Coordonner la réponse', proofReference: 'mandat-signé' },
    });
    expect(crisisCellResponse.ok()).toBeTruthy();
    expect(String((await crisisCellResponse.json()).data.event_id)).toBe(String(event.id));

    // --- Décision ---
    const decisionResponse = await request.post(`${API_URL}/resilience/decisions`, {
      headers: withKey('dec'),
      data: { eventId: event.id, authorUserId: 1, decision: 'Basculer sur le site secondaire', justification: 'RTO dépassé', proofReference: 'pv-décision' },
    });
    expect(decisionResponse.ok()).toBeTruthy();

    // --- Communication : refus si auteur == approbateur, puis publication valide ---
    const badCommResponse = await request.post(`${API_URL}/resilience/communications`, {
      headers: withKey('com-bad'),
      data: { eventId: event.id, authorUserId: 1, approverUserId: 1, channel: 'email', audience: 'clients', message: 'Nous travaillons sur le problème', proofReference: 'approbation-1' },
    });
    expect(badCommResponse.status()).toBe(409);

    const communicationResponse = await request.post(`${API_URL}/resilience/communications`, {
      headers: withKey('com'),
      data: { eventId: event.id, authorUserId: 1, approverUserId: 2, channel: 'email', audience: 'clients', message: 'Nous travaillons sur le problème', proofReference: 'approbation-2' },
    });
    expect(communicationResponse.ok()).toBeTruthy();

    // --- Chronologie : created_by doit être l'utilisateur authentifié ---
    const timelineResponse = await request.post(`${API_URL}/resilience/timeline`, {
      headers,
      data: { eventId: event.id, entryType: 'action', details: { action: 'redémarrage serveur' } },
    });
    expect(timelineResponse.ok()).toBeTruthy();
    const timelineEntry = (await timelineResponse.json()).data;
    expect(timelineEntry.details).toEqual({ action: 'redémarrage serveur' });
    expect(String(timelineEntry.created_by)).toBe('1');

    // --- Exercice : refus si complété sans rapport, puis exercice complété valide ---
    const badExerciseResponse = await request.post(`${API_URL}/resilience/exercises`, {
      headers: withKey('ex-bad'),
      data: { title: 'Simulation panne', scenario: 'Coupure électrique', coordinatorUserId: 1, performedAt: '2026-06-01', status: 'completed' },
    });
    expect(badExerciseResponse.status()).toBe(409);

    const exerciseResponse = await request.post(`${API_URL}/resilience/exercises`, {
      headers: withKey('ex'),
      data: { title: 'Simulation panne', scenario: 'Coupure électrique', coordinatorUserId: 1, performedAt: '2026-06-01', status: 'completed', reportReference: 'rapport-exercice-1' },
    });
    expect(exerciseResponse.ok()).toBeTruthy();
    expect((await exerciseResponse.json()).data.status).toBe('completed');

    // --- Leçon apprise ---
    const lessonResponse = await request.post(`${API_URL}/resilience/lessons`, {
      headers: withKey('lesson'),
      data: { sourceType: 'event', sourceId: event.id, lesson: 'Améliorer redondance', impact: 'high', ownerUserId: 1, proofReference: 'analyse-post-mortem' },
    });
    expect(lessonResponse.ok()).toBeTruthy();
    const lesson = (await lessonResponse.json()).data;

    // --- Amélioration : refus sans propriétaire, puis création et fermeture (refus sans preuve) ---
    const missingOwnerResponse = await request.post(`${API_URL}/resilience/improvements`, {
      headers,
      data: { lessonId: lesson.id, title: 'Ajouter site secondaire' },
    });
    expect(missingOwnerResponse.status()).toBe(400);

    const improvementResponse = await request.post(`${API_URL}/resilience/improvements`, {
      headers,
      data: { lessonId: lesson.id, title: 'Ajouter site secondaire', ownerUserId: 1, dueAt: '2026-12-31' },
    });
    expect(improvementResponse.ok()).toBeTruthy();
    const improvement = (await improvementResponse.json()).data;
    expect(improvement.status).toBe('open');

    const badCloseResponse = await request.post(`${API_URL}/resilience/improvements/${improvement.id}/close`, {
      headers: withKey('close-bad'),
      data: {},
    });
    expect(badCloseResponse.status()).toBe(409);

    const closeResponse = await request.post(`${API_URL}/resilience/improvements/${improvement.id}/close`, {
      headers: withKey('close'),
      data: { closureProofReference: 'site-secondaire-déployé' },
    });
    expect(closeResponse.ok()).toBeTruthy();
    expect((await closeResponse.json()).data.status).toBe('closed');

    // --- Listes et alertes ---
    const eventsListResponse = await request.get(`${API_URL}/resilience/events`, { headers });
    expect(eventsListResponse.ok()).toBeTruthy();
    expect((await eventsListResponse.json()).data.some((e) => e.id === event.id)).toBe(true);

    const alertsResponse = await request.get(`${API_URL}/resilience/alerts`, { headers });
    expect(alertsResponse.ok()).toBeTruthy();
    const alerts = (await alertsResponse.json()).data;
    expect(alerts.some((a) => a.alert_type === 'open_major_event' && String(a.id) === String(event.id))).toBe(true);
  });
});
