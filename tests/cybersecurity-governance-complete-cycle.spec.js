const { test, expect } = require('@playwright/test');

const API_URL = process.env.TEST_API_URL || process.env.BACKEND_URL || process.env.API_URL || 'http://127.0.0.1:5000/api';
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('cycle complet gouvernance de la cybersécurité', () => {
  test.skip(!email || !password, 'Identifiants E2E requis.');

  test('actif, contrôle vérifié, vulnérabilité (transition), incident (fermeture), revue d’accès et exercice', async ({ request }) => {
    const suffix = Date.now();
    const login = await request.post(`${API_URL}/login`, { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    const loginBody = await login.json();
    const token = loginBody?.data?.token || loginBody?.token;
    const headers = { Authorization: `Bearer ${token}` };
    const withKey = (key) => ({ ...headers, 'Idempotency-Key': `e2e-cyber-${suffix}-${key}` });

    // --- Actif cyber : refus sans gouvernance (propriétaire/date de revue), puis création valide ---
    const badAssetResponse = await request.post(`${API_URL}/cybersecurity/assets`, {
      headers: withKey('a-bad'),
      data: { assetNumber: `CSA-${suffix}`, name: 'Serveur paie', assetType: 'application' },
    });
    expect(badAssetResponse.status()).toBe(400);

    const assetResponse = await request.post(`${API_URL}/cybersecurity/assets`, {
      headers: withKey('a'),
      data: { assetNumber: `CSA-${suffix}`, name: 'Serveur paie', assetType: 'application', nextReviewAt: '2027-01-01', evidence: ['inventaire.pdf'] },
    });
    expect(assetResponse.ok()).toBeTruthy();
    const asset = (await assetResponse.json()).data;

    // --- Contrôle : refus sans clé d'idempotence, puis création et vérification (refus sans preuve) ---
    const missingKeyControlResponse = await request.post(`${API_URL}/cybersecurity/controls`, {
      headers,
      data: { assetId: asset.id, controlNumber: `CTRL-${suffix}`, controlFamily: 'access_control', title: 'MFA obligatoire', description: 'Authentification à deux facteurs' },
    });
    expect(missingKeyControlResponse.status()).toBe(400);

    const controlResponse = await request.post(`${API_URL}/cybersecurity/controls`, {
      headers: withKey('ctrl'),
      data: { assetId: asset.id, controlNumber: `CTRL-${suffix}`, controlFamily: 'access_control', title: 'MFA obligatoire', description: 'Authentification à deux facteurs' },
    });
    expect(controlResponse.ok()).toBeTruthy();
    const control = (await controlResponse.json()).data;

    const badVerifyResponse = await request.post(`${API_URL}/cybersecurity/controls/${control.id}/verify`, {
      headers: withKey('ver-bad'),
      data: { result: 'conforme', nextVerificationAt: '2026-12-01' },
    });
    expect(badVerifyResponse.status()).toBe(409);

    const verifyResponse = await request.post(`${API_URL}/cybersecurity/controls/${control.id}/verify`, {
      headers: withKey('ver'),
      data: { result: 'conforme', nextVerificationAt: '2026-12-01', evidence: ['capture-mfa.pdf'] },
    });
    expect(verifyResponse.ok()).toBeTruthy();
    expect((await verifyResponse.json()).data.implementation_status).toBe('verified');

    // --- Vulnérabilité : refus sans clé d'idempotence, puis création et mitigation (refus sans preuve) ---
    const missingKeyVulnResponse = await request.post(`${API_URL}/cybersecurity/vulnerabilities`, {
      headers,
      data: { assetId: asset.id, vulnerabilityNumber: `VULN-${suffix}`, title: 'CVE critique', description: 'Injection SQL', severity: 'critical', source: 'scan' },
    });
    expect(missingKeyVulnResponse.status()).toBe(400);

    const vulnResponse = await request.post(`${API_URL}/cybersecurity/vulnerabilities`, {
      headers: withKey('vuln'),
      data: { assetId: asset.id, vulnerabilityNumber: `VULN-${suffix}`, title: 'CVE critique', description: 'Injection SQL', severity: 'critical', source: 'scan' },
    });
    expect(vulnResponse.ok()).toBeTruthy();
    const vulnerability = (await vulnResponse.json()).data;

    const badTransitionResponse = await request.post(`${API_URL}/cybersecurity/vulnerabilities/${vulnerability.id}/transition`, {
      headers: withKey('vt-bad'),
      data: { action: 'mitigated', remediationPlan: 'Patch appliqué' },
    });
    expect(badTransitionResponse.status()).toBe(409);

    const transitionResponse = await request.post(`${API_URL}/cybersecurity/vulnerabilities/${vulnerability.id}/transition`, {
      headers: withKey('vt'),
      data: { action: 'mitigated', remediationPlan: 'Patch appliqué', evidence: ['rapport-patch.pdf'] },
    });
    expect(transitionResponse.ok()).toBeTruthy();
    expect((await transitionResponse.json()).data.status).toBe('mitigated');

    // --- Incident critique : refus sans traçabilité, puis enregistrement et fermeture ---
    const badIncidentResponse = await request.post(`${API_URL}/cybersecurity/incidents`, {
      headers: withKey('inc-bad'),
      data: { incidentNumber: `INC-${suffix}`, title: 'Intrusion', description: 'Accès non autorisé détecté', severity: 'critical', occurredAt: '2026-06-01' },
    });
    expect(badIncidentResponse.status()).toBe(409);

    const incidentResponse = await request.post(`${API_URL}/cybersecurity/incidents`, {
      headers: withKey('inc'),
      data: { incidentNumber: `INC-${suffix}`, title: 'Intrusion', description: 'Accès non autorisé détecté', severity: 'critical', occurredAt: '2026-06-01', affectedAssets: ['CSA-1'], decisionLog: ['isolement du serveur'], containmentActions: ['reset mots de passe'], evidence: ['journal-siem.pdf'] },
    });
    expect(incidentResponse.ok()).toBeTruthy();
    const incident = (await incidentResponse.json()).data;

    const closeIncidentResponse = await request.post(`${API_URL}/cybersecurity/incidents/${incident.id}/close`, {
      headers: withKey('close'),
      data: { rootCause: 'Mot de passe faible', lessonsLearned: 'Renforcer politique MDP', evidence: ['postmortem.pdf'] },
    });
    expect(closeIncidentResponse.ok()).toBeTruthy();
    expect((await closeIncidentResponse.json()).data.status).toBe('closed');

    // --- Revue d'accès ---
    const accessReviewResponse = await request.post(`${API_URL}/cybersecurity/access-reviews`, {
      headers: withKey('ar'),
      data: { reviewNumber: `AR-${suffix}`, scope: 'Accès admin', conclusion: 'Conforme', nextReviewAt: '2027-01-01', evidence: ['revue-accès.pdf'] },
    });
    expect(accessReviewResponse.ok()).toBeTruthy();

    // --- Exercice de simulation ---
    const exerciseResponse = await request.post(`${API_URL}/cybersecurity/exercises`, {
      headers: withKey('ex'),
      data: { exerciseNumber: `EX-${suffix}`, exerciseType: 'phishing', scenario: 'Campagne hameçonnage', result: '15% de clics', conclusion: 'Formation requise', improvementActions: ['formation obligatoire'], evidence: ['rapport-simulation.pdf'] },
    });
    expect(exerciseResponse.ok()).toBeTruthy();

    // --- Listes et alertes ---
    const assetsListResponse = await request.get(`${API_URL}/cybersecurity/assets`, { headers });
    expect(assetsListResponse.ok()).toBeTruthy();
    expect((await assetsListResponse.json()).data.some((a) => a.id === asset.id)).toBe(true);

    const alertsResponse = await request.get(`${API_URL}/cybersecurity/alerts`, { headers });
    expect(alertsResponse.ok()).toBeTruthy();
    expect(Array.isArray((await alertsResponse.json()).data)).toBe(true);
  });
});
