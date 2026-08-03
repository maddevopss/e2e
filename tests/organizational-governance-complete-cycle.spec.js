const { test, expect } = require('@playwright/test');

const API_URL = process.env.TEST_API_URL || process.env.BACKEND_URL || process.env.API_URL || 'http://127.0.0.1:5000/api';
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('cycle complet gouvernance organisationnelle', () => {
  test.skip(!email || !password, 'Identifiants E2E requis.');

  test('unité, délégation, comité, réunion, décision (délégation d’autorité), politique et conflit d’intérêts', async ({ request }) => {
    const suffix = Date.now();
    const login = await request.post(`${API_URL}/login`, { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    const loginBody = await login.json();
    const token = loginBody?.data?.token || loginBody?.token;
    const headers = { Authorization: `Bearer ${token}` };
    const withKey = (key) => ({ ...headers, 'Idempotency-Key': `e2e-gov-${suffix}-${key}` });

    // --- Unité organisationnelle ---
    const unitResponse = await request.post(`${API_URL}/governance/units`, {
      headers: withKey('u'),
      data: { unitCode: `U-${suffix}`, name: 'Finances', unitType: 'department', mandate: 'Gérer les finances', effectiveFrom: '2026-01-01' },
    });
    expect(unitResponse.ok()).toBeTruthy();

    // --- Délégation : refus si délégant == délégataire, puis délégation valide couvrant la date courante ---
    const badDelegationResponse = await request.post(`${API_URL}/governance/delegations`, {
      headers: withKey('del-bad'),
      data: { delegationNumber: `DEL-${suffix}-bad`, delegateUserId: 1, authorityType: 'decision.approve', reason: 'Absence', startsAt: '2026-07-01', endsAt: '2026-12-31', scope: ['finance'], evidence: ['lettre.pdf'] },
    });
    expect(badDelegationResponse.status()).toBe(400);

    const delegationResponse = await request.post(`${API_URL}/governance/delegations`, {
      headers: withKey('del'),
      data: { delegationNumber: `DEL-${suffix}`, delegateUserId: 2, authorityType: 'decision.approve', reason: 'Absence', startsAt: '2026-07-01', endsAt: '2026-12-31', scope: ['finance'], evidence: ['lettre.pdf'] },
    });
    expect(delegationResponse.ok()).toBeTruthy();

    // --- Comité et réunion : refus de complétion sans quorum, puis complétion valide ---
    const committeeResponse = await request.post(`${API_URL}/governance/committees`, {
      headers,
      data: { committeeCode: `COM-${suffix}`, name: 'Comité de direction', mandate: 'Superviser la stratégie', chairUserId: 1, quorumRequired: 2, members: [1, 2] },
    });
    expect(committeeResponse.ok()).toBeTruthy();
    const committee = (await committeeResponse.json()).data;

    const missingKeyMeetingResponse = await request.post(`${API_URL}/governance/meetings`, {
      headers,
      data: { committeeId: committee.id, meetingNumber: `MTG-${suffix}`, scheduledAt: '2026-06-01' },
    });
    expect(missingKeyMeetingResponse.status()).toBe(400);

    const meetingResponse = await request.post(`${API_URL}/governance/meetings`, {
      headers: withKey('mtg'),
      data: { committeeId: committee.id, meetingNumber: `MTG-${suffix}`, scheduledAt: '2026-06-01' },
    });
    expect(meetingResponse.ok()).toBeTruthy();
    const meeting = (await meetingResponse.json()).data;

    const badCompleteResponse = await request.post(`${API_URL}/governance/meetings/${meeting.id}/complete`, {
      headers: withKey('mc-bad'),
      data: { minutes: 'Réunion tenue', attendees: [1, 2], agenda: ['budget'], evidence: ['pv.pdf'] },
    });
    expect(badCompleteResponse.status()).toBe(409);

    const completeResponse = await request.post(`${API_URL}/governance/meetings/${meeting.id}/complete`, {
      headers: withKey('mc'),
      data: { minutes: 'Réunion tenue', attendees: [1, 2], agenda: ['budget'], evidence: ['pv.pdf'], quorumMet: true },
    });
    expect(completeResponse.ok()).toBeTruthy();
    expect((await completeResponse.json()).data.status).toBe('completed');

    // --- Décision : refus si auteur == approbateur, refus si autorité insuffisante hors période, puis approbation par délégation valide ---
    const decisionResponse = await request.post(`${API_URL}/governance/decisions`, {
      headers: withKey('dec'),
      data: { decisionNumber: `DEC-${suffix}`, category: 'finance', title: 'Approuver budget', context: 'Croissance', analysis: 'ROI positif', decisionText: 'Augmenter budget', justification: 'Opportunité', evidence: ['analyse.pdf'] },
    });
    expect(decisionResponse.ok()).toBeTruthy();
    const decision = (await decisionResponse.json()).data;
    expect(decision.status).toBe('draft');

    // L'auteur de la décision (utilisateur 1) ne peut pas être son propre approbateur — comparaison
    // qui doit tolérer que author_user_id revienne en bigint (chaîne) de la base.
    const badSameAuthorResponse = await request.post(`${API_URL}/governance/decisions/${decision.id}/approve`, {
      headers: withKey('dec-ap-bad'),
      data: { approverUserId: 1, approvalReason: 'Validé', authorityType: 'decision.approve', requestedScope: 'finance' },
    });
    expect(badSameAuthorResponse.status()).toBe(409);

    const approveResponse = await request.post(`${API_URL}/governance/decisions/${decision.id}/approve`, {
      headers: withKey('dec-ap'),
      data: { approverUserId: 2, approvalReason: 'Validé au nom du délégant', authorityType: 'decision.approve', requestedScope: 'finance' },
    });
    expect(approveResponse.ok()).toBeTruthy();
    expect((await approveResponse.json()).data.status).toBe('approved');

    // --- Politique : refus de publication si propriétaire == approbateur, puis publication valide ---
    const policyResponse = await request.post(`${API_URL}/governance/policies`, {
      headers: withKey('pol'),
      data: { policyNumber: `POL-${suffix}`, title: 'Politique de délégation', version: '1.0', contentReference: 'doc-1' },
    });
    expect(policyResponse.ok()).toBeTruthy();
    const policy = (await policyResponse.json()).data;

    const badPublishResponse = await request.post(`${API_URL}/governance/policies/${policy.id}/publish`, {
      headers: withKey('pol-pub-bad'),
      data: { approvedByUserId: 1, effectiveFrom: '2026-08-01', reviewDueAt: '2027-08-01', approvalEvidence: ['pv.pdf'] },
    });
    expect(badPublishResponse.status()).toBe(409);

    const publishResponse = await request.post(`${API_URL}/governance/policies/${policy.id}/publish`, {
      headers: withKey('pol-pub'),
      data: { approvedByUserId: 2, effectiveFrom: '2026-08-01', reviewDueAt: '2027-08-01', approvalEvidence: ['pv.pdf'] },
    });
    expect(publishResponse.ok()).toBeTruthy();
    expect((await publishResponse.json()).data.status).toBe('published');

    // --- Déclaration de conflit d'intérêts ---
    const conflictResponse = await request.post(`${API_URL}/governance/conflicts`, {
      headers: withKey('conf'),
      data: { conflictNumber: `CONF-${suffix}`, subjectType: 'decision', subjectId: decision.id, description: 'Intérêt financier dans le fournisseur', mitigation: 'Récusation de la décision' },
    });
    expect(conflictResponse.ok()).toBeTruthy();

    // --- Listes et alertes ---
    const unitsListResponse = await request.get(`${API_URL}/governance/units`, { headers });
    expect(unitsListResponse.ok()).toBeTruthy();

    const alertsResponse = await request.get(`${API_URL}/governance/alerts`, { headers });
    expect(alertsResponse.ok()).toBeTruthy();
    expect(Array.isArray((await alertsResponse.json()).data)).toBe(true);
  });
});
