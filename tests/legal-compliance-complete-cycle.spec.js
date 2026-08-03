const { test, expect } = require('@playwright/test');

const API_URL = process.env.TEST_API_URL || process.env.BACKEND_URL || process.env.API_URL || 'http://127.0.0.1:5000/api';
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('cycle complet juridique et conformité', () => {
  test.skip(!email || !password, 'Identifiants E2E requis.');

  test('obligations, évaluations de conformité, contrats, politiques et dossiers juridiques', async ({ request }) => {
    const suffix = Date.now();
    const login = await request.post(`${API_URL}/login`, { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    const loginBody = await login.json();
    const token = loginBody?.data?.token || loginBody?.token;
    const headers = { Authorization: `Bearer ${token}` };
    const withKey = (key) => ({ ...headers, 'Idempotency-Key': `e2e-legal-${suffix}-${key}` });

    // --- Obligation : création avec source traçable ---
    const obligationResponse = await request.post(`${API_URL}/legal/obligations`, {
      headers: withKey('obligation'),
      data: {
        code: `OBL-${suffix}`,
        title: 'Obligation E2E',
        jurisdiction: 'QC',
        authority: 'CNESST',
        sourceUrl: 'https://example.com/loi',
        version: '1.0',
        effectiveFrom: '2026-01-01',
        requirements: ['req1', 'req2'],
      },
    });
    expect(obligationResponse.ok()).toBeTruthy();
    const obligation = (await obligationResponse.json()).data.obligation;
    expect(obligation.status).toBe('active');
    expect(obligation.requirements).toEqual(['req1', 'req2']);

    // --- Évaluation de conformité : refus sans preuve si conforme, puis avec preuve ---
    const badAssessmentResponse = await request.post(`${API_URL}/legal/obligations/${obligation.id}/assessments`, {
      headers: withKey('assess-bad'),
      data: { status: 'compliant', rationale: 'Sans preuve' },
    });
    expect(badAssessmentResponse.status()).toBe(400);

    const assessmentResponse = await request.post(`${API_URL}/legal/obligations/${obligation.id}/assessments`, {
      headers: withKey('assess'),
      data: { status: 'compliant', rationale: 'Vérifié et conforme', evidence: ['audit.pdf'] },
    });
    expect(assessmentResponse.ok()).toBeTruthy();
    const assessment = (await assessmentResponse.json()).data.assessment;
    expect(assessment.status).toBe('compliant');
    expect(assessment.evidence).toEqual(['audit.pdf']);
    expect(assessment.source_snapshot.code).toBe(obligation.code);

    // --- Contrat : création puis refus de signature sans preuve, puis signature avec preuve ---
    const contractResponse = await request.post(`${API_URL}/legal/contracts`, {
      headers,
      data: {
        contractNumber: `CTR-${suffix}`,
        title: 'Contrat E2E',
        contractType: 'vendor',
        counterpartyName: 'Fournisseur X',
        startsAt: '2026-01-01',
        terms: { paymentDays: 30 },
      },
    });
    expect(contractResponse.ok()).toBeTruthy();
    const contract = (await contractResponse.json()).data;
    expect(contract.status).toBe('draft');
    expect(contract.terms).toEqual({ paymentDays: 30 });

    const badSignResponse = await request.post(`${API_URL}/legal/contracts/${contract.id}/signed`, {
      headers: withKey('sign-bad'),
      data: {},
    });
    expect(badSignResponse.status()).toBe(400);

    const signResponse = await request.post(`${API_URL}/legal/contracts/${contract.id}/signed`, {
      headers: withKey('sign'),
      data: { evidence: ['signature.pdf'] },
    });
    expect(signResponse.ok()).toBeTruthy();
    const signedContract = (await signResponse.json()).data.record;
    expect(signedContract.status).toBe('signed');
    expect(signedContract.evidence).toEqual(['signature.pdf']);

    // Une résiliation sans raison doit être refusée.
    const badTerminateResponse = await request.post(`${API_URL}/legal/contracts/${contract.id}/terminated`, {
      headers: withKey('terminate-bad'),
      data: { evidence: ['x'] },
    });
    expect(badTerminateResponse.status()).toBe(400);

    // --- Politique : publication puis accusé de réception lié à un employé RH réel ---
    const policyResponse = await request.post(`${API_URL}/legal/policies`, {
      headers,
      data: { code: `POL-${suffix}`, title: 'Politique E2E', version: '1.0', content: { body: 'texte de la politique' } },
    });
    expect(policyResponse.ok()).toBeTruthy();
    const policy = (await policyResponse.json()).data;
    expect(policy.status).toBe('draft');
    expect(policy.content).toEqual({ body: 'texte de la politique' });

    const employeeResponse = await request.post(`${API_URL}/hr/employees`, {
      headers: withKey('employee'),
      data: { employeeNumber: `E2E-LEGAL-${suffix}`, legalName: 'Employé Legal E2E', hireDate: '2026-01-15' },
    });
    expect(employeeResponse.ok()).toBeTruthy();
    const employee = (await employeeResponse.json()).data.employee;

    // Un accusé de réception sans clé d'idempotence doit être refusé.
    const missingKeyAckResponse = await request.post(`${API_URL}/legal/policies/${policy.id}/acknowledgements`, {
      headers,
      data: { employeeId: employee.id, evidence: ['lu-et-approuvé'] },
    });
    expect(missingKeyAckResponse.status()).toBe(400);

    const ackResponse = await request.post(`${API_URL}/legal/policies/${policy.id}/acknowledgements`, {
      headers: withKey('ack'),
      data: { employeeId: employee.id, evidence: ['lu-et-approuvé'] },
    });
    expect(ackResponse.ok()).toBeTruthy();
    const acknowledgement = (await ackResponse.json()).data;
    expect(acknowledgement.evidence).toEqual(['lu-et-approuvé']);
    expect(String(acknowledgement.employee_id)).toBe(String(employee.id));

    // --- Dossier juridique : ouverture, refus de fermeture sans raison, fermeture avec raison ---
    const matterResponse = await request.post(`${API_URL}/legal/matters`, {
      headers,
      data: {
        matterNumber: `MAT-${suffix}`,
        matterType: 'litigation',
        title: 'Litige E2E',
        description: 'Description du litige',
        riskLevel: 'high',
      },
    });
    expect(matterResponse.ok()).toBeTruthy();
    const matter = (await matterResponse.json()).data;
    expect(matter.status).toBe('open');

    const badCloseMatterResponse = await request.post(`${API_URL}/legal/matters/${matter.id}/closed`, {
      headers: withKey('matter-close-bad'),
      data: {},
    });
    expect(badCloseMatterResponse.status()).toBe(400);

    const closeMatterResponse = await request.post(`${API_URL}/legal/matters/${matter.id}/closed`, {
      headers: withKey('matter-close'),
      data: { reason: 'Réglé à l’amiable', evidence: ['entente.pdf'] },
    });
    expect(closeMatterResponse.ok()).toBeTruthy();
    const closedMatter = (await closeMatterResponse.json()).data.record;
    expect(closedMatter.status).toBe('closed');
    expect(closedMatter.closure_reason).toBe('Réglé à l’amiable');

    // --- Listes et alertes ---
    const obligationsListResponse = await request.get(`${API_URL}/legal/obligations`, { headers });
    expect(obligationsListResponse.ok()).toBeTruthy();
    const obligationsList = (await obligationsListResponse.json()).data;
    expect(obligationsList.some((o) => o.id === obligation.id)).toBe(true);

    const assessmentsListResponse = await request.get(`${API_URL}/legal/assessments`, { headers });
    expect(assessmentsListResponse.ok()).toBeTruthy();
    const assessmentsList = (await assessmentsListResponse.json()).data;
    expect(assessmentsList.some((a) => a.id === assessment.id)).toBe(true);

    const alertsResponse = await request.get(`${API_URL}/legal/alerts`, { headers });
    expect(alertsResponse.ok()).toBeTruthy();
    const alerts = (await alertsResponse.json()).data;
    expect(alerts).toHaveProperty('obligations');
    expect(alerts).toHaveProperty('contracts');
    expect(alerts).toHaveProperty('policies');
    expect(alerts).toHaveProperty('matters');
  });
});
