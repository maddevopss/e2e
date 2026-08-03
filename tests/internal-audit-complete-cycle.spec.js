const { test, expect } = require('@playwright/test');

const API_URL = process.env.TEST_API_URL || process.env.BACKEND_URL || process.env.API_URL || 'http://127.0.0.1:5000/api';
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('cycle complet audit interne', () => {
  test.skip(!email || !password, 'Identifiants E2E requis.');

  test('programme, mission, constat, action corrective, lien de preuve croisé et suivi', async ({ request }) => {
    const suffix = Date.now();
    const login = await request.post(`${API_URL}/login`, { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    const loginBody = await login.json();
    const token = loginBody?.data?.token || loginBody?.token;
    const headers = { Authorization: `Bearer ${token}` };
    const withKey = (key) => ({ ...headers, 'Idempotency-Key': `e2e-audit-${suffix}-${key}` });

    // --- Programme d'audit ---
    const programResponse = await request.post(`${API_URL}/internal-audit/programs`, {
      headers: withKey('prog'),
      data: { programNumber: `PROG-${suffix}`, title: 'Programme annuel 2026', periodStart: '2026-01-01', periodEnd: '2026-12-31', objectives: 'Vérifier la conformité', ownerUserId: 1, scope: ['finance'], riskBasis: ['registre des risques'] },
    });
    expect(programResponse.ok()).toBeTruthy();
    const program = (await programResponse.json()).data;

    // --- Mission d'audit : refus sans clé d'idempotence, puis création valide ---
    const missingKeyEngResponse = await request.post(`${API_URL}/internal-audit/engagements`, {
      headers,
      data: { programId: program.id, engagementNumber: `ENG-${suffix}`, title: 'Audit paie', auditType: 'operational', objective: 'Évaluer les contrôles', auditeeOwnerUserId: 1 },
    });
    expect(missingKeyEngResponse.status()).toBe(400);

    const engagementResponse = await request.post(`${API_URL}/internal-audit/engagements`, {
      headers: withKey('eng'),
      data: { programId: program.id, engagementNumber: `ENG-${suffix}`, title: 'Audit paie', auditType: 'operational', objective: 'Évaluer les contrôles', scope: ['processus paie'], criteria: ['ISO27001'], auditeeOwnerUserId: 1 },
    });
    expect(engagementResponse.ok()).toBeTruthy();
    const engagement = (await engagementResponse.json()).data;

    // --- Constat critique : refus sans preuve, puis création valide ---
    const badFindingResponse = await request.post(`${API_URL}/internal-audit/findings`, {
      headers: withKey('f-bad'),
      data: { engagementId: engagement.id, findingNumber: `F-${suffix}`, classification: 'critical', title: 'Ségrégation manquante', description: 'Un seul utilisateur approuve et paie', criterion: 'ISO27001 A.9', ownerUserId: 1 },
    });
    expect(badFindingResponse.status()).toBe(409);

    const findingResponse = await request.post(`${API_URL}/internal-audit/findings`, {
      headers: withKey('find'),
      data: { engagementId: engagement.id, findingNumber: `F-${suffix}`, classification: 'critical', title: 'Ségrégation manquante', description: 'Un seul utilisateur approuve et paie', criterion: 'ISO27001 A.9', ownerUserId: 1, evidence: ['capture-écran-rôles.pdf'] },
    });
    expect(findingResponse.ok()).toBeTruthy();
    const finding = (await findingResponse.json()).data;
    expect(finding.status).toBe('open');

    // --- Action corrective : refus sans clé d'idempotence, puis création ---
    const missingKeyActionResponse = await request.post(`${API_URL}/internal-audit/actions`, {
      headers,
      data: { findingId: finding.id, actionNumber: `ACT-${suffix}`, description: 'Séparer les rôles', ownerUserId: 1 },
    });
    expect(missingKeyActionResponse.status()).toBe(400);

    const actionResponse = await request.post(`${API_URL}/internal-audit/actions`, {
      headers: withKey('act'),
      data: { findingId: finding.id, actionNumber: `ACT-${suffix}`, description: 'Séparer les rôles', ownerUserId: 1 },
    });
    expect(actionResponse.ok()).toBeTruthy();
    const action = (await actionResponse.json()).data;

    // --- Fermeture du constat refusée tant qu'une action reste ouverte ---
    const prematureCloseResponse = await request.post(`${API_URL}/internal-audit/findings/${finding.id}/close`, {
      headers: withKey('close-bad'),
      data: { closureReason: 'Corrigé', evidence: ['preuve.pdf'] },
    });
    expect(prematureCloseResponse.status()).toBe(409);

    // --- Cycle de vie de l'action : implémentée → vérifiée → fermée ---
    const implementResponse = await request.post(`${API_URL}/internal-audit/actions/${action.id}/transition`, {
      headers: withKey('impl'),
      data: { action: 'implemented', implementationResult: 'Rôles séparés dans le système', implementationEvidence: ['capture-nouveaux-rôles.pdf'] },
    });
    expect(implementResponse.ok()).toBeTruthy();
    expect((await implementResponse.json()).data.status).toBe('implemented');

    const verifyResponse = await request.post(`${API_URL}/internal-audit/actions/${action.id}/transition`, {
      headers: withKey('verif'),
      data: { action: 'verified', implementationResult: 'Rôles séparés', implementationEvidence: ['capture.pdf'], effectivenessResult: 'Contrôle efficace', verificationEvidence: ['test-indépendant.pdf'] },
    });
    expect(verifyResponse.ok()).toBeTruthy();

    const closeActionResponse = await request.post(`${API_URL}/internal-audit/actions/${action.id}/transition`, {
      headers: withKey('act-close'),
      data: { action: 'closed', implementationResult: 'Rôles séparés', implementationEvidence: ['capture.pdf'], effectivenessResult: 'Contrôle efficace', verificationEvidence: ['test-indépendant.pdf'] },
    });
    expect(closeActionResponse.ok()).toBeTruthy();
    expect((await closeActionResponse.json()).data.status).toBe('closed');

    // --- Fermeture du constat maintenant possible ---
    const closeFindingResponse = await request.post(`${API_URL}/internal-audit/findings/${finding.id}/close`, {
      headers: withKey('close'),
      data: { closureReason: 'Corrigé et vérifié', evidence: ['preuve-finale.pdf'] },
    });
    expect(closeFindingResponse.ok()).toBeTruthy();
    expect((await closeFindingResponse.json()).data.status).toBe('closed');

    // --- Lien de preuve croisé vers un autre module (sous-monté à /corrective-action-links) ---
    const activityResponse = await request.post(`${API_URL}/privacy/processing-activities`, {
      headers: withKey('pa'),
      data: { activityNumber: `PA-${suffix}`, name: 'Paie', purpose: 'Traitement paie', legalBasis: 'contract', nextReviewAt: '2027-01-01', retentionPeriodDays: 365, dataCategories: ['nom'], subjectCategories: ['employés'] },
    });
    expect(activityResponse.ok()).toBeTruthy();
    const activity = (await activityResponse.json()).data;

    const retentionResponse = await request.post(`${API_URL}/privacy/retention-actions`, {
      headers: withKey('ret'),
      data: { processingActivityId: activity.id, actionNumber: `RA-${suffix}`, actionType: 'delete', dueAt: '2026-12-31' },
    });
    expect(retentionResponse.ok()).toBeTruthy();
    const retentionAction = (await retentionResponse.json()).data;

    const missingKeyLinkResponse = await request.post(`${API_URL}/internal-audit/corrective-action-links`, {
      headers,
      data: { findingId: finding.id, targetType: 'privacy_retention_action', targetId: retentionAction.id, rationale: 'Preuve de correction' },
    });
    expect(missingKeyLinkResponse.status()).toBe(400);

    const invalidTargetTypeResponse = await request.post(`${API_URL}/internal-audit/corrective-action-links`, {
      headers: withKey('link-bad'),
      data: { findingId: finding.id, targetType: 'bogus_type', targetId: retentionAction.id, rationale: 'Preuve de correction' },
    });
    expect(invalidTargetTypeResponse.status()).toBe(400);

    const linkResponse = await request.post(`${API_URL}/internal-audit/corrective-action-links`, {
      headers: withKey('link'),
      data: { findingId: finding.id, targetType: 'privacy_retention_action', targetId: retentionAction.id, rationale: 'Preuve de correction via purge programmée' },
    });
    expect(linkResponse.ok()).toBeTruthy();
    const link = (await linkResponse.json()).data;
    expect(String(link.finding_id)).toBe(String(finding.id));
    expect(String(link.created_by)).toBe('1');

    // --- Suivi post-mission ---
    const followupResponse = await request.post(`${API_URL}/internal-audit/followups`, {
      headers: withKey('fu'),
      data: { engagementId: engagement.id, followupNumber: `FU-${suffix}`, conclusion: 'Toutes les actions complétées', evidence: ['rapport-suivi.pdf'] },
    });
    expect(followupResponse.ok()).toBeTruthy();

    // --- Listes et alertes ---
    const findingsListResponse = await request.get(`${API_URL}/internal-audit/findings`, { headers });
    expect(findingsListResponse.ok()).toBeTruthy();
    expect((await findingsListResponse.json()).data.some((f) => f.id === finding.id)).toBe(true);

    const alertsResponse = await request.get(`${API_URL}/internal-audit/alerts`, { headers });
    expect(alertsResponse.ok()).toBeTruthy();
    expect(Array.isArray((await alertsResponse.json()).data)).toBe(true);
  });
});
