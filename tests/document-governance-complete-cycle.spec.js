const { test, expect } = require('@playwright/test');

const API_URL = process.env.TEST_API_URL || process.env.BACKEND_URL || process.env.API_URL || 'http://127.0.0.1:5000/api';
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('cycle complet gouvernance documentaire avancée', () => {
  test.skip(!email || !password, 'Identifiants E2E requis.');

  test('classification, document, version approuvée, publication, référence de preuve, rétention et revue d’accès', async ({ request }) => {
    const suffix = Date.now();
    const login = await request.post(`${API_URL}/login`, { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    const loginBody = await login.json();
    const token = loginBody?.data?.token || loginBody?.token;
    const headers = { Authorization: `Bearer ${token}` };
    const withKey = (key) => ({ ...headers, 'Idempotency-Key': `e2e-docgov-${suffix}-${key}` });

    // --- Classification ---
    const classificationResponse = await request.post(`${API_URL}/document-governance/classifications`, {
      headers: withKey('class'),
      data: { classificationCode: `CONF-${suffix}`, name: 'Confidentiel RH', sensitivityLevel: 'confidential', retentionYears: 7, evidence: ['politique-classification.pdf'] },
    });
    expect(classificationResponse.ok()).toBeTruthy();
    const classification = (await classificationResponse.json()).data;

    // --- Document ---
    const documentResponse = await request.post(`${API_URL}/document-governance/documents`, {
      headers,
      data: { classificationId: classification.id, documentCode: `DOC-${suffix}`, title: 'Politique de confidentialité', evidence: ['brouillon.pdf'] },
    });
    expect(documentResponse.ok()).toBeTruthy();
    const doc = (await documentResponse.json()).data;
    expect(doc.status).toBe('draft');

    // --- Version : refus si même préparateur/approbateur, puis version approuvée valide ---
    const badVersionResponse = await request.post(`${API_URL}/document-governance/documents/${doc.id}/versions`, {
      headers: withKey('v-bad'),
      data: { versionNumber: 1, changeSummary: 'Version initiale', contentHash: 'hash1', storageRef: 's3://docs/1', preparedByUserId: 1, approvedByUserId: 1, evidence: ['revue.pdf'] },
    });
    expect(badVersionResponse.status()).toBe(409);

    const versionResponse = await request.post(`${API_URL}/document-governance/documents/${doc.id}/versions`, {
      headers: withKey('v'),
      data: { versionNumber: 1, changeSummary: 'Version initiale', contentHash: 'hash1', storageRef: 's3://docs/1', preparedByUserId: 1, approvedByUserId: 2, approvedAt: '2026-07-01', evidence: ['revue.pdf'] },
    });
    expect(versionResponse.ok()).toBeTruthy();
    const version = (await versionResponse.json()).data;

    // --- Publication ---
    const publishResponse = await request.post(`${API_URL}/document-governance/documents/${doc.id}/publish`, {
      headers: withKey('pub'),
      data: { approvedVersionId: version.id, effectiveAt: '2026-07-15', evidence: ['approbation-finale.pdf'] },
    });
    expect(publishResponse.ok()).toBeTruthy();
    const published = (await publishResponse.json()).data;
    expect(published.status).toBe('published');

    // --- Référence de preuve (sous-module monté à /evidence-references) ---
    const missingKeyRefResponse = await request.post(`${API_URL}/document-governance/evidence-references`, {
      headers,
      data: { documentId: doc.id, aggregateType: 'hr_employee', aggregateId: 1 },
    });
    expect(missingKeyRefResponse.status()).toBe(400);

    const missingDocRefResponse = await request.post(`${API_URL}/document-governance/evidence-references`, {
      headers: withKey('ref-bad'),
      data: { documentId: 999999, aggregateType: 'hr_employee', aggregateId: 1 },
    });
    expect(missingDocRefResponse.status()).toBe(404);

    const evidenceRefResponse = await request.post(`${API_URL}/document-governance/evidence-references`, {
      headers: withKey('ref'),
      data: { documentId: doc.id, versionId: version.id, aggregateType: 'hr_employee', aggregateId: 1, evidenceRole: 'policy_acknowledgement', rationale: 'Preuve de politique signée' },
    });
    expect(evidenceRefResponse.ok()).toBeTruthy();
    const evidenceRef = (await evidenceRefResponse.json()).data;
    expect(String(evidenceRef.document_id)).toBe(String(doc.id));
    expect(String(evidenceRef.created_by)).toBe('1');

    // --- Action de rétention : refus sans clé d'idempotence, puis création et exécution (refus si approbateur == exécutant) ---
    const missingKeyRetentionResponse = await request.post(`${API_URL}/document-governance/retention-actions`, {
      headers,
      data: { documentId: doc.id, actionType: 'archive', scheduledAt: '2026-12-31', reason: 'Fin de cycle de vie', evidence: ['plan-archivage.pdf'] },
    });
    expect(missingKeyRetentionResponse.status()).toBe(400);

    const retentionResponse = await request.post(`${API_URL}/document-governance/retention-actions`, {
      headers: withKey('ret'),
      data: { documentId: doc.id, actionType: 'archive', scheduledAt: '2026-12-31', reason: 'Fin de cycle de vie', evidence: ['plan-archivage.pdf'] },
    });
    expect(retentionResponse.ok()).toBeTruthy();
    const retention = (await retentionResponse.json()).data;
    expect(retention.status).toBe('pending');

    const badExecuteResponse = await request.post(`${API_URL}/document-governance/retention-actions/${retention.id}/execute`, {
      headers: withKey('exec-bad'),
      data: { approvedByUserId: 2, executedByUserId: 2, evidence: ['archive-confirmée.pdf'] },
    });
    expect(badExecuteResponse.status()).toBe(409);

    const executeResponse = await request.post(`${API_URL}/document-governance/retention-actions/${retention.id}/execute`, {
      headers: withKey('exec'),
      data: { approvedByUserId: 2, executedByUserId: 3, evidence: ['archive-confirmée.pdf'] },
    });
    expect(executeResponse.ok()).toBeTruthy();
    expect((await executeResponse.json()).data.status).toBe('executed');

    // --- Revue d'accès ---
    const accessReviewResponse = await request.post(`${API_URL}/document-governance/access-reviews`, {
      headers: withKey('ar'),
      data: { documentId: doc.id, reviewedAt: '2026-07-01', authorizedRoles: ['rh_admin'], findings: ['accès conforme'], evidence: ['revue-acces.pdf'] },
    });
    expect(accessReviewResponse.ok()).toBeTruthy();
    const accessReview = (await accessReviewResponse.json()).data;
    expect(accessReview.authorized_roles).toEqual(['rh_admin']);

    // --- Listes et alertes ---
    const documentsListResponse = await request.get(`${API_URL}/document-governance/documents`, { headers });
    expect(documentsListResponse.ok()).toBeTruthy();
    expect((await documentsListResponse.json()).data.some((d) => d.id === doc.id)).toBe(true);

    const alertsResponse = await request.get(`${API_URL}/document-governance/alerts`, { headers });
    expect(alertsResponse.ok()).toBeTruthy();
    expect(Array.isArray((await alertsResponse.json()).data)).toBe(true);
  });
});
