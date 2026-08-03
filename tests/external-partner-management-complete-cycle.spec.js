const { test, expect } = require('@playwright/test');

const API_URL = process.env.TEST_API_URL || process.env.BACKEND_URL || process.env.API_URL || 'http://127.0.0.1:5000/api';
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('cycle complet partenaires externes', () => {
  test.skip(!email || !password, 'Identifiants E2E requis.');

  test('partenaire, entente (brouillon et approuvée), certification, évaluation et incident', async ({ request }) => {
    const suffix = Date.now();
    const login = await request.post(`${API_URL}/login`, { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    const loginBody = await login.json();
    const token = loginBody?.data?.token || loginBody?.token;
    const headers = { Authorization: `Bearer ${token}` };
    const withKey = (key) => ({ ...headers, 'Idempotency-Key': `e2e-partner-${suffix}-${key}` });

    // --- Partenaire : refus sans propriétaire de relation ni preuve, puis enregistrement valide ---
    const badPartnerResponse = await request.post(`${API_URL}/partners/partners`, {
      headers: withKey('partner-bad'),
      data: { partnerCode: `PART-${suffix}`, legalName: 'Fournisseur E2E', partnerType: 'vendor' },
    });
    expect(badPartnerResponse.status()).toBe(409);

    const partnerResponse = await request.post(`${API_URL}/partners/partners`, {
      headers: withKey('partner'),
      data: {
        partnerCode: `PART-${suffix}`,
        legalName: 'Fournisseur E2E',
        partnerType: 'vendor',
        primaryContact: { email: 'contact@fournisseur.com' },
        address: { city: 'Montréal' },
        relationshipOwnerUserId: 1,
        evidence: ['contrat-cadre.pdf'],
      },
    });
    expect(partnerResponse.ok()).toBeTruthy();
    const partner = (await partnerResponse.json()).data;
    expect(partner.status).toBe('active');
    expect(partner.primary_contact).toEqual({ email: 'contact@fournisseur.com' });

    // --- Entente brouillon : aucune validation métier requise (design du module) ---
    const draftAgreementResponse = await request.post(`${API_URL}/partners/agreements`, {
      headers,
      data: { partnerId: partner.id, agreementNumber: `AGR-${suffix}-draft`, agreementType: 'service', title: 'Entente brouillon', effectiveFrom: '2026-01-01', ownerUserId: 1 },
    });
    expect(draftAgreementResponse.ok()).toBeTruthy();
    expect((await draftAgreementResponse.json()).data.status).toBe('draft');

    // --- Entente approuvée : refus si propriétaire == approbateur, puis approbation indépendante valide ---
    const badAgreementResponse = await request.post(`${API_URL}/partners/agreements`, {
      headers: withKey('agr-bad'),
      data: { partnerId: partner.id, agreementNumber: `AGR-${suffix}-bad`, agreementType: 'service', title: 'Entente', effectiveFrom: '2026-01-01', ownerUserId: 1, approvedByUserId: 1, status: 'approved', responsibilities: ['livrer'], evidence: ['signature.pdf'] },
    });
    expect(badAgreementResponse.status()).toBe(409);

    const agreementResponse = await request.post(`${API_URL}/partners/agreements`, {
      headers: withKey('agr'),
      data: {
        partnerId: partner.id,
        agreementNumber: `AGR-${suffix}`,
        agreementType: 'service',
        title: 'Entente de service',
        effectiveFrom: '2026-01-01',
        ownerUserId: 1,
        approvedByUserId: 2,
        status: 'approved',
        responsibilities: ['livrer à temps'],
        obligations: ['confidentialité'],
        serviceLevels: { uptime: '99.9%' },
        evidence: ['signature.pdf'],
      },
    });
    expect(agreementResponse.ok()).toBeTruthy();
    const agreement = (await agreementResponse.json()).data;
    expect(agreement.status).toBe('approved');
    expect(agreement.responsibilities).toEqual(['livrer à temps']);
    expect(agreement.service_levels).toEqual({ uptime: '99.9%' });

    // --- Certification vérifiée ---
    const certificationResponse = await request.post(`${API_URL}/partners/certifications`, {
      headers: withKey('cert'),
      data: { partnerId: partner.id, certificationType: 'ISO9001', issuedBy: 'Bureau Veritas', issuedAt: '2026-01-01', expiresAt: '2028-01-01', verificationStatus: 'verified', verifiedByUserId: 2, evidence: ['certificat.pdf'] },
    });
    expect(certificationResponse.ok()).toBeTruthy();
    expect((await certificationResponse.json()).data.verification_status).toBe('verified');

    // --- Évaluation : refus si date future, puis évaluation valide ---
    const badAssessmentResponse = await request.post(`${API_URL}/partners/assessments`, {
      headers: withKey('ass-bad'),
      data: { partnerId: partner.id, assessmentType: 'annual_review', assessedAt: '2027-01-01', assessedByUserId: 1, riskLevel: 'low', criteria: ['qualité'], evidence: ['rapport.pdf'] },
    });
    expect(badAssessmentResponse.status()).toBe(409);

    const assessmentResponse = await request.post(`${API_URL}/partners/assessments`, {
      headers: withKey('ass'),
      data: { partnerId: partner.id, assessmentType: 'annual_review', assessedAt: '2026-06-01', assessedByUserId: 1, riskLevel: 'low', criteria: ['qualité', 'délai'], score: 85, findings: ['bon rendement'], recommendations: ['renouveler'], evidence: ['rapport.pdf'] },
    });
    expect(assessmentResponse.ok()).toBeTruthy();
    const assessment = (await assessmentResponse.json()).data;
    expect(assessment.criteria).toEqual(['qualité', 'délai']);
    expect(assessment.findings).toEqual(['bon rendement']);

    // --- Incident ---
    const incidentResponse = await request.post(`${API_URL}/partners/incidents`, {
      headers: withKey('inc'),
      data: { partnerId: partner.id, occurredAt: '2026-05-01', incidentType: 'late_delivery', severity: 'medium', description: 'Livraison en retard', responsibleUserId: 1, correctiveActions: ['plan de rattrapage'], evidence: ['email.pdf'] },
    });
    expect(incidentResponse.ok()).toBeTruthy();
    const incident = (await incidentResponse.json()).data;
    expect(incident.status).toBe('open');
    expect(incident.corrective_actions).toEqual(['plan de rattrapage']);

    // --- Listes et alertes ---
    const partnersListResponse = await request.get(`${API_URL}/partners/partners`, { headers });
    expect(partnersListResponse.ok()).toBeTruthy();
    expect((await partnersListResponse.json()).data.some((p) => p.id === partner.id)).toBe(true);

    const alertsResponse = await request.get(`${API_URL}/partners/alerts`, { headers });
    expect(alertsResponse.ok()).toBeTruthy();
    const alerts = (await alertsResponse.json()).data;
    expect(alerts.some((a) => a.alert_type === 'open_partner_incident' && String(a.id) === String(incident.id))).toBe(true);
  });
});
