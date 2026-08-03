const { test, expect } = require('@playwright/test');

const API_URL = process.env.TEST_API_URL || process.env.BACKEND_URL || process.env.API_URL || 'http://127.0.0.1:5000/api';
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('cycle complet gestion des risques d’entreprise', () => {
  test.skip(!email || !password, 'Identifiants E2E requis.');

  test('risque, évaluation, contrôle, traitement, revue, incident, lien de continuité et lien institutionnel', async ({ request }) => {
    const suffix = Date.now();
    const login = await request.post(`${API_URL}/login`, { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    const loginBody = await login.json();
    const token = loginBody?.data?.token || loginBody?.token;
    const headers = { Authorization: `Bearer ${token}` };
    const withKey = (key) => ({ ...headers, 'Idempotency-Key': `e2e-risk-${suffix}-${key}` });

    // --- Registre des risques : refus sans clé d'idempotence, puis création ---
    const missingKeyRiskResponse = await request.post(`${API_URL}/risks`, {
      headers,
      data: { riskNumber: `RISK-${suffix}`, category: 'operational', title: 'Panne serveur', description: 'Risque de panne', likelihood: 3, impact: 4 },
    });
    expect(missingKeyRiskResponse.status()).toBe(400);

    const riskResponse = await request.post(`${API_URL}/risks`, {
      headers: withKey('r'),
      data: { riskNumber: `RISK-${suffix}`, category: 'operational', title: 'Panne serveur', description: 'Risque de panne', likelihood: 3, impact: 4, appetiteThreshold: 10, evidence: ['analyse.pdf'] },
    });
    expect(riskResponse.ok()).toBeTruthy();
    const risk = (await riskResponse.json()).data;
    expect(risk.status).toBe('open');
    expect(risk.evidence).toEqual(['analyse.pdf']);

    // --- Évaluation ---
    const assessmentResponse = await request.post(`${API_URL}/risks/assessments`, {
      headers: withKey('a'),
      data: { riskId: risk.id, likelihood: 3, impact: 4, controlEffectiveness: 50, conclusion: 'Risque partiellement maîtrisé', evidence: ['revue.pdf'] },
    });
    expect(assessmentResponse.ok()).toBeTruthy();
    expect((await assessmentResponse.json()).data.residual_score).toBe('6.00');

    // --- Contrôle : refus sans clé (statut par défaut, sans policy de transition), création, refus de passage actif sans preuve, puis passage actif ---
    const missingKeyControlResponse = await request.post(`${API_URL}/risks/controls`, {
      headers,
      data: { riskId: risk.id, controlNumber: `CTRL-${suffix}`, objective: 'Réduire panne', description: 'Redondance serveur' },
    });
    expect(missingKeyControlResponse.status()).toBe(400);

    const controlResponse = await request.post(`${API_URL}/risks/controls`, {
      headers: withKey('c'),
      data: { riskId: risk.id, controlNumber: `CTRL-${suffix}`, objective: 'Réduire panne', description: 'Redondance serveur', frequency: 'monthly' },
    });
    expect(controlResponse.ok()).toBeTruthy();
    const control = (await controlResponse.json()).data;
    expect(control.status).toBe('planned');

    const badControlTransitionResponse = await request.post(`${API_URL}/risks/controls/${control.id}/transition`, {
      headers: withKey('ct-bad'),
      data: { action: 'active' },
    });
    expect(badControlTransitionResponse.status()).toBe(409);

    const controlTransitionResponse = await request.post(`${API_URL}/risks/controls/${control.id}/transition`, {
      headers: withKey('ct'),
      data: { action: 'active', verificationEvidence: ['test-controle.pdf'], effectiveness: 70 },
    });
    expect(controlTransitionResponse.ok()).toBeTruthy();
    expect((await controlTransitionResponse.json()).data.status).toBe('active');

    // --- Traitement : refus sans clé, création, refus de clôture sans résultat, mise en oeuvre puis clôture ---
    const missingKeyTreatmentResponse = await request.post(`${API_URL}/risks/treatments`, {
      headers,
      data: { riskId: risk.id, treatmentNumber: `TRT-${suffix}`, strategy: 'reduce', description: 'Ajout redondance' },
    });
    expect(missingKeyTreatmentResponse.status()).toBe(400);

    const treatmentResponse = await request.post(`${API_URL}/risks/treatments`, {
      headers: withKey('t'),
      data: { riskId: risk.id, treatmentNumber: `TRT-${suffix}`, strategy: 'reduce', description: 'Ajout redondance', dueAt: '2026-12-01' },
    });
    expect(treatmentResponse.ok()).toBeTruthy();
    const treatment = (await treatmentResponse.json()).data;
    expect(treatment.status).toBe('planned');

    const badTreatmentCloseResponse = await request.post(`${API_URL}/risks/treatments/${treatment.id}/transition`, {
      headers: withKey('tt-bad'),
      data: { action: 'closed', evidence: ['preuve.pdf'] },
    });
    expect(badTreatmentCloseResponse.status()).toBe(409);

    const treatmentImplementResponse = await request.post(`${API_URL}/risks/treatments/${treatment.id}/transition`, {
      headers: withKey('tt1'),
      data: { action: 'implemented', evidence: ['install.pdf'] },
    });
    expect(treatmentImplementResponse.ok()).toBeTruthy();

    const treatmentCloseResponse = await request.post(`${API_URL}/risks/treatments/${treatment.id}/transition`, {
      headers: withKey('tt2'),
      data: { action: 'closed', result: 'efficace', evidence: ['cloture.pdf'] },
    });
    expect(treatmentCloseResponse.ok()).toBeTruthy();
    const closedTreatment = (await treatmentCloseResponse.json()).data;
    expect(closedTreatment.status).toBe('closed');
    expect(closedTreatment.evidence).toEqual(['install.pdf', 'cloture.pdf']);

    // --- Revue : refus sans clé, création, refus d'approbation sans prochaine date de revue, puis approbation ---
    const missingKeyReviewResponse = await request.post(`${API_URL}/risks/reviews`, {
      headers,
      data: { riskId: risk.id, reviewNumber: `REV-${suffix}` },
    });
    expect(missingKeyReviewResponse.status()).toBe(400);

    const reviewResponse = await request.post(`${API_URL}/risks/reviews`, {
      headers: withKey('rv'),
      data: { riskId: risk.id, reviewNumber: `REV-${suffix}` },
    });
    expect(reviewResponse.ok()).toBeTruthy();
    const review = (await reviewResponse.json()).data;
    expect(review.status).toBe('draft');

    const badReviewApproveResponse = await request.post(`${API_URL}/risks/reviews/${review.id}/transition`, {
      headers: withKey('rt-bad'),
      data: { action: 'approved', conclusion: 'Risque maîtrisé', evidence: ['revue.pdf'] },
    });
    expect(badReviewApproveResponse.status()).toBe(400);

    const reviewApproveResponse = await request.post(`${API_URL}/risks/reviews/${review.id}/transition`, {
      headers: withKey('rt'),
      data: { action: 'approved', conclusion: 'Risque maîtrisé', evidence: ['revue.pdf'], nextReviewAt: '2027-01-01' },
    });
    expect(reviewApproveResponse.ok()).toBeTruthy();
    expect((await reviewApproveResponse.json()).data.status).toBe('approved');

    // --- Incident : refus si sévérité critique sans preuve, puis incident critique valide ---
    const badIncidentResponse = await request.post(`${API_URL}/risks/incidents`, {
      headers: withKey('inc-bad'),
      data: { riskId: risk.id, incidentNumber: `INC-${suffix}`, sourceType: 'monitoring', title: 'Panne majeure', description: 'Serveur down', severity: 'critical' },
    });
    expect(badIncidentResponse.status()).toBe(409);

    const incidentResponse = await request.post(`${API_URL}/risks/incidents`, {
      headers: withKey('inc'),
      data: { riskId: risk.id, incidentNumber: `INC-${suffix}`, sourceType: 'monitoring', title: 'Panne majeure', description: 'Serveur down', severity: 'critical', evidence: ['log.txt'] },
    });
    expect(incidentResponse.ok()).toBeTruthy();

    // --- Lien de continuité (sous-module monté à /continuity-links) : nécessite un processus métier ---
    const missingKeyContinuityLinkResponse = await request.post(`${API_URL}/risks/continuity-links`, {
      headers,
      data: { riskId: risk.id, relationType: 'threatens_process', rationale: 'Lien test' },
    });
    expect(missingKeyContinuityLinkResponse.status()).toBe(400);

    const riskNotFoundContinuityLinkResponse = await request.post(`${API_URL}/risks/continuity-links`, {
      headers: withKey('cl-nf'),
      data: { riskId: 999999, relationType: 'threatens_process', rationale: 'Lien test' },
    });
    expect(riskNotFoundContinuityLinkResponse.status()).toBe(404);

    const processResponse = await request.post(`${API_URL}/business-continuity/processes`, {
      headers: withKey('proc'),
      data: { processNumber: `PROC-${suffix}`, name: 'Paie mensuelle', description: 'Traitement de la paie', maximumTolerableDowntimeMinutes: 60, recoveryTimeObjectiveMinutes: 30, nextReviewAt: '2027-01-01' },
    });
    expect(processResponse.ok()).toBeTruthy();
    const process = (await processResponse.json()).data;

    const continuityLinkResponse = await request.post(`${API_URL}/risks/continuity-links`, {
      headers: withKey('cl'),
      data: { riskId: risk.id, processId: process.id, relationType: 'threatens_process', rationale: 'Le risque menace la continuité', evidence: ['analyse-continuite.pdf'] },
    });
    expect(continuityLinkResponse.ok()).toBeTruthy();
    expect((await continuityLinkResponse.json()).data.resource.process_id).toBe(String(process.id));

    const continuityLinksListResponse = await request.get(`${API_URL}/risks/continuity-links`, { headers });
    expect(continuityLinksListResponse.ok()).toBeTruthy();
    expect((await continuityLinksListResponse.json()).data.items.length).toBeGreaterThan(0);

    // --- Lien institutionnel (sous-module monté à /risk-links) : vers un incident de cybersécurité ---
    const missingKeyRiskLinkResponse = await request.post(`${API_URL}/risks/risk-links`, {
      headers,
      data: { riskId: risk.id, targetType: 'cybersecurity_incident', targetId: 1, relationshipType: 'source', rationale: 'Lien' },
    });
    expect(missingKeyRiskLinkResponse.status()).toBe(400);

    const invalidTargetTypeResponse = await request.post(`${API_URL}/risks/risk-links`, {
      headers: withKey('rl-bad'),
      data: { riskId: risk.id, targetType: 'bogus_type', targetId: 1, relationshipType: 'source', rationale: 'Lien' },
    });
    expect(invalidTargetTypeResponse.status()).toBe(400);

    const cyberIncidentResponse = await request.post(`${API_URL}/cybersecurity/incidents`, {
      headers: withKey('cyi'),
      data: { incidentNumber: `CYI-${suffix}`, title: 'Tentative intrusion', description: 'Accès non autorisé détecté', severity: 'high', occurredAt: '2026-08-01', affectedAssets: ['serveur-web'], decisionLog: ['isolation réseau'] },
    });
    expect(cyberIncidentResponse.ok()).toBeTruthy();
    const cyberIncident = (await cyberIncidentResponse.json()).data;

    const targetNotFoundResponse = await request.post(`${API_URL}/risks/risk-links`, {
      headers: withKey('rl-nf'),
      data: { riskId: risk.id, targetType: 'cybersecurity_incident', targetId: 999999, relationshipType: 'source', rationale: 'Lien' },
    });
    expect(targetNotFoundResponse.status()).toBe(404);

    const riskLinkResponse = await request.post(`${API_URL}/risks/risk-links`, {
      headers: withKey('rl'),
      data: { riskId: risk.id, targetType: 'cybersecurity_incident', targetId: cyberIncident.id, relationshipType: 'source', rationale: 'Le risque origine de cet incident', evidence: ['forensic.pdf'] },
    });
    expect(riskLinkResponse.ok()).toBeTruthy();

    const riskLinksListResponse = await request.get(`${API_URL}/risks/risk-links`, { headers });
    expect(riskLinksListResponse.ok()).toBeTruthy();
    expect((await riskLinksListResponse.json()).data.items.length).toBeGreaterThan(0);

    // --- Listes et alertes ---
    const risksListResponse = await request.get(`${API_URL}/risks`, { headers });
    expect(risksListResponse.ok()).toBeTruthy();
    expect((await risksListResponse.json()).data.some((r) => r.id === risk.id)).toBe(true);

    const alertsResponse = await request.get(`${API_URL}/risks/alerts`, { headers });
    expect(alertsResponse.ok()).toBeTruthy();
    expect(Array.isArray((await alertsResponse.json()).data)).toBe(true);
  });
});
