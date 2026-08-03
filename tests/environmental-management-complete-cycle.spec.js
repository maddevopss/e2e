const { test, expect } = require('@playwright/test');

const API_URL = process.env.TEST_API_URL || process.env.BACKEND_URL || process.env.API_URL || 'http://127.0.0.1:5000/api';
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('cycle complet gestion environnementale', () => {
  test.skip(!email || !password, 'Identifiants E2E requis.');

  test('permis, incident, inspection, indicateur et rapport avec approbation indépendante', async ({ request }) => {
    const suffix = Date.now();
    const login = await request.post(`${API_URL}/login`, { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    const loginBody = await login.json();
    const token = loginBody?.data?.token || loginBody?.token;
    const headers = { Authorization: `Bearer ${token}` };
    const withKey = (key) => ({ ...headers, 'Idempotency-Key': `e2e-env-${suffix}-${key}` });

    // --- Permis : refus sans preuve, puis enregistrement avec preuve ---
    const badPermitResponse = await request.post(`${API_URL}/environment/permits`, {
      headers: withKey('permit-bad'),
      data: { permitType: 'air_emissions', permitNumber: `PER-${suffix}`, issuingAuthority: 'MELCC', issuedAt: '2026-01-01', expiresAt: '2027-01-01' },
    });
    expect(badPermitResponse.status()).toBe(409);

    const permitResponse = await request.post(`${API_URL}/environment/permits`, {
      headers: withKey('permit'),
      data: { permitType: 'air_emissions', permitNumber: `PER-${suffix}`, issuingAuthority: 'MELCC', issuedAt: '2026-01-01', expiresAt: '2027-01-01', proofRefs: ['permis.pdf'] },
    });
    expect(permitResponse.ok()).toBeTruthy();
    const permit = (await permitResponse.json()).data;
    expect(permit.status).toBe('active');
    expect(permit.proof_refs).toEqual(['permis.pdf']);
    // created_by doit être l'utilisateur authentifié, jamais une valeur fournie par le client.
    expect(String(permit.created_by)).toBe('1');

    // --- Incident : refus si date future, puis signalement valide ---
    const futureIncidentResponse = await request.post(`${API_URL}/environment/incidents`, {
      headers: withKey('inc-bad'),
      data: { siteId: 1, occurredAt: '2027-01-01', incidentType: 'spill', severity: 'high', description: 'Déversement', responsibleUserId: 1, proofRefs: ['photo.jpg'] },
    });
    expect(futureIncidentResponse.status()).toBe(409);

    const incidentResponse = await request.post(`${API_URL}/environment/incidents`, {
      headers: withKey('inc'),
      data: { siteId: 1, occurredAt: '2026-01-15', incidentType: 'spill', severity: 'high', description: 'Déversement de solvant', responsibleUserId: 1, immediateActions: ['confinement'], proofRefs: ['photo.jpg'] },
    });
    expect(incidentResponse.ok()).toBeTruthy();
    const incident = (await incidentResponse.json()).data;
    expect(incident.status).toBe('open');
    expect(incident.immediate_actions).toEqual(['confinement']);
    expect(String(incident.created_by)).toBe('1');

    // --- Inspection ---
    const inspectionResponse = await request.post(`${API_URL}/environment/inspections`, {
      headers: withKey('insp'),
      data: { siteId: 1, inspectedAt: '2026-07-01', inspectorUserId: 1, scope: ['eaux usées'], findings: ['conforme'], proofRefs: ['rapport.pdf'] },
    });
    expect(inspectionResponse.ok()).toBeTruthy();
    const inspection = (await inspectionResponse.json()).data;
    expect(inspection.status).toBe('completed');
    expect(inspection.scope).toEqual(['eaux usées']);

    // --- Indicateur environnemental ---
    const metricResponse = await request.post(`${API_URL}/environment/metrics`, {
      headers: withKey('metric'),
      data: { metricType: 'co2_emissions', periodStart: '2026-01-01', periodEnd: '2026-06-30', value: 123.4, unit: 'tonnes', methodology: 'GHG Protocol', sourceRefs: ['facture-energie.pdf'] },
    });
    expect(metricResponse.ok()).toBeTruthy();
    const metric = (await metricResponse.json()).data;
    expect(metric.source_refs).toEqual(['facture-energie.pdf']);
    expect(String(metric.recorded_by)).toBe('1');

    // --- Rapport : refus si préparateur == approbateur (séparation des tâches), puis publication valide ---
    const badReportResponse = await request.post(`${API_URL}/environment/reports`, {
      headers: withKey('rep-bad'),
      data: { reportType: 'annual', periodStart: '2026-01-01', periodEnd: '2026-12-31', summary: 'Résumé', preparedBy: 1, approvedBy: 1, indicators: { co2: 123.4 }, risks: ['faible'], proofRefs: ['rapport.pdf'] },
    });
    expect(badReportResponse.status()).toBe(409);

    const reportResponse = await request.post(`${API_URL}/environment/reports`, {
      headers: withKey('rep'),
      data: { reportType: 'annual', periodStart: '2026-01-01', periodEnd: '2026-12-31', summary: 'Résumé annuel', preparedBy: 1, approvedBy: 2, indicators: { co2: 123.4 }, risks: ['faible'], proofRefs: ['rapport.pdf'] },
    });
    expect(reportResponse.ok()).toBeTruthy();
    const report = (await reportResponse.json()).data;
    expect(report.status).toBe('published');
    expect(report.indicators).toEqual({ co2: 123.4 });
    expect(String(report.prepared_by)).toBe('1');
    expect(String(report.approved_by)).toBe('2');

    // --- Listes et alertes ---
    const permitsListResponse = await request.get(`${API_URL}/environment/permits`, { headers });
    expect(permitsListResponse.ok()).toBeTruthy();
    expect((await permitsListResponse.json()).data.some((p) => p.id === permit.id)).toBe(true);

    const alertsResponse = await request.get(`${API_URL}/environment/alerts`, { headers });
    expect(alertsResponse.ok()).toBeTruthy();
    expect(Array.isArray((await alertsResponse.json()).data)).toBe(true);

    // Aucune route ne permet de créer une action corrective (seule /close existe) ; la table
    // reste donc vide et fermer une action inexistante est refusé par la politique métier.
    const closeUnknownActionResponse = await request.post(`${API_URL}/environment/corrective-actions/999999/close`, {
      headers: withKey('close-unknown'),
      data: { closureEvidence: ['x'] },
    });
    expect(closeUnknownActionResponse.status()).toBe(400);
  });
});
