const { test, expect } = require('@playwright/test');

const API_URL = process.env.TEST_API_URL || process.env.BACKEND_URL || process.env.API_URL || 'http://127.0.0.1:5000/api';
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('cycle complet santé et sécurité au travail (SST)', () => {
  test.skip(!email || !password, 'Identifiants E2E requis.');

  test('danger, incident, action corrective, inspection, EPI, plan d’urgence, formation et enquête', async ({ request }) => {
    const suffix = Date.now();
    const login = await request.post(`${API_URL}/login`, { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    const loginBody = await login.json();
    const token = loginBody?.data?.token || loginBody?.token;
    const headers = { Authorization: `Bearer ${token}` };
    const withKey = (key) => ({ ...headers, 'Idempotency-Key': `e2e-sst-${suffix}-${key}` });

    // --- Danger : création et score de risque calculé côté serveur ---
    const hazardResponse = await request.post(`${API_URL}/sst/hazards`, {
      headers: withKey('hazard'),
      data: {
        title: 'Sol glissant E2E',
        category: 'physical',
        probability: 3,
        severity: 4,
        location: 'Entrepôt A',
        controlMeasures: ['Signalisation'],
        evidence: ['photo1.jpg'],
      },
    });
    expect(hazardResponse.ok()).toBeTruthy();
    const hazard = (await hazardResponse.json()).data.hazard;
    expect(hazard.risk_score).toBe(12);
    expect(hazard.evidence).toEqual(['photo1.jpg']);

    // --- Incident : faits minimaux obligatoires ---
    const incidentResponse = await request.post(`${API_URL}/sst/incidents`, {
      headers: withKey('incident'),
      data: {
        incidentType: 'near_miss',
        occurredAt: '2026-08-01T10:00:00Z',
        location: 'Entrepôt A',
        description: 'Chute évitée de justesse',
        severity: 3,
        immediateActions: ['Zone sécurisée'],
        personsInvolved: ['Employé 1'],
        witnesses: ['Témoin 1'],
        evidence: ['rapport.pdf'],
      },
    });
    expect(incidentResponse.ok()).toBeTruthy();
    const incident = (await incidentResponse.json()).data.incident;
    expect(incident.status).toBe('reported');
    expect(incident.evidence).toEqual(['rapport.pdf']);

    // --- Action corrective : cycle complet assign → start → correct → verify → close ---
    const actionResponse = await request.post(`${API_URL}/sst/corrective-actions`, {
      headers,
      data: {
        sourceType: 'hazard',
        sourceId: hazard.id,
        title: 'Ajouter signalisation permanente',
        description: 'Installer un panneau',
        priority: 'high',
        dueAt: '2026-09-01',
      },
    });
    expect(actionResponse.ok()).toBeTruthy();
    const correctiveAction = (await actionResponse.json()).data;

    for (const action of ['assign', 'start']) {
      const response = await request.post(`${API_URL}/sst/corrective-actions/${correctiveAction.id}/${action}`, {
        headers: withKey(`ca-${action}`),
        data: {},
      });
      expect(response.ok()).toBeTruthy();
    }

    const correctResponse = await request.post(`${API_URL}/sst/corrective-actions/${correctiveAction.id}/correct`, {
      headers: withKey('ca-correct'),
      data: { evidence: ['photo-apres.jpg'] },
    });
    expect(correctResponse.ok()).toBeTruthy();
    expect((await correctResponse.json()).data.action.correction_evidence).toEqual(['photo-apres.jpg']);

    const verifyResponse = await request.post(`${API_URL}/sst/corrective-actions/${correctiveAction.id}/verify`, {
      headers: withKey('ca-verify'),
      data: { evidence: ['photo-verification.jpg'] },
    });
    expect(verifyResponse.ok()).toBeTruthy();

    // Une transition correct/verify sans preuve doit être refusée.
    const secondActionResponse = await request.post(`${API_URL}/sst/corrective-actions`, {
      headers,
      data: { sourceType: 'hazard', sourceId: hazard.id, title: 'Action sans preuve', description: 'Test sans preuve', priority: 'low', dueAt: '2026-09-01' },
    });
    const secondAction = (await secondActionResponse.json()).data;
    const missingEvidenceResponse = await request.post(`${API_URL}/sst/corrective-actions/${secondAction.id}/correct`, {
      headers: withKey('ca2-correct'),
      data: {},
    });
    expect(missingEvidenceResponse.status()).toBe(400);

    const closeActionResponse = await request.post(`${API_URL}/sst/corrective-actions/${correctiveAction.id}/close`, {
      headers: withKey('ca-close'),
      data: { reason: 'Corrigé et vérifié' },
    });
    expect(closeActionResponse.ok()).toBeTruthy();
    expect((await closeActionResponse.json()).data.action.status).toBe('closed');

    // --- Inspection : constat critique lié à une action corrective réelle, puis contresignature ---
    const inspectionResponse = await request.post(`${API_URL}/sst/inspections`, {
      headers,
      data: { inspectionType: 'routine', location: 'Entrepôt A', scheduledAt: '2026-08-01', checklist: [{ item: 'Extincteurs', status: 'pending' }] },
    });
    expect(inspectionResponse.ok()).toBeTruthy();
    const inspection = (await inspectionResponse.json()).data;
    const inspectionId = inspection.id;
    expect(inspectionId).toBeTruthy();

    const closeInspectionResponse = await request.post(`${API_URL}/sst/inspections/${inspectionId}/close`, {
      headers: withKey('insp-close'),
      data: {
        completedChecklist: [{ item: 'Extincteurs', status: 'ok' }],
        findings: [{ severity: 'critical', description: 'Extincteur périmé', correctiveActionId: correctiveAction.id }],
      },
    });
    expect(closeInspectionResponse.ok()).toBeTruthy();
    const closure = (await closeInspectionResponse.json()).data.closure;
    expect(closure.result).toBe('conditional');
    expect(closure.corrective_action_ids).toContain(Number(correctiveAction.id));

    const approveClosureResponse = await request.post(`${API_URL}/sst/inspections/${inspectionId}/approve-closure`, {
      headers: withKey('insp-approve'),
      data: {},
    });
    expect(approveClosureResponse.ok()).toBeTruthy();
    expect((await approveClosureResponse.json()).data.closure.approved_at).toBeTruthy();

    // Une inspection déjà fermée doit refuser une deuxième fermeture.
    const doubleCloseResponse = await request.post(`${API_URL}/sst/inspections/${inspectionId}/close`, {
      headers: withKey('insp-close-2'),
      data: { completedChecklist: [{ item: 'x', status: 'ok' }] },
    });
    expect(doubleCloseResponse.status()).toBe(409);

    // --- Équipement de protection individuelle ---
    const ppeResponse = await request.post(`${API_URL}/sst/ppe`, {
      headers,
      data: {
        assetCode: `EPI-${suffix}`,
        ppeType: 'harnais',
        manufacturer: '3M',
        issuedAt: '2026-01-01',
        nextInspectionAt: '2026-09-01',
        evidence: ['photo-epi.jpg'],
      },
    });
    expect(ppeResponse.ok()).toBeTruthy();
    expect((await ppeResponse.json()).data.evidence).toEqual(['photo-epi.jpg']);

    // --- Plan d'urgence : création, activation, exercice ---
    const planResponse = await request.post(`${API_URL}/sst/emergency-plans`, {
      headers: withKey('plan'),
      data: {
        planCode: `PLAN-INCENDIE-${suffix}`,
        scenarioType: 'fire',
        title: 'Plan incendie E2E',
        procedure: 'Évacuer par la sortie A',
        assemblyPoint: 'Stationnement',
        evidence: ['plan.pdf'],
      },
    });
    expect(planResponse.ok()).toBeTruthy();
    const plan = (await planResponse.json()).data.plan;
    expect(plan.status).toBe('draft');

    const activatePlanResponse = await request.post(`${API_URL}/sst/emergency-plans/${plan.id}/activate`, {
      headers: withKey('plan-activate'),
      data: {},
    });
    expect(activatePlanResponse.ok()).toBeTruthy();
    expect((await activatePlanResponse.json()).data.plan.status).toBe('active');

    const drillResponse = await request.post(`${API_URL}/sst/emergency-drills`, {
      headers: withKey('drill'),
      data: { planId: plan.id, conductedAt: '2026-08-01', participantsCount: 15, observations: 'Bon exercice', evidence: ['photo-exercice.jpg'] },
    });
    expect(drillResponse.ok()).toBeTruthy();
    expect((await drillResponse.json()).data.drill.evidence).toEqual(['photo-exercice.jpg']);

    // Un exercice contre un plan non actif (brouillon) doit être refusé.
    const draftPlanResponse = await request.post(`${API_URL}/sst/emergency-plans`, {
      headers: withKey('plan2'),
      data: { planCode: `PLAN-DRAFT-${suffix}`, scenarioType: 'flood', title: 'Plan inondation E2E', procedure: 'Fermer les vannes' },
    });
    const draftPlan = (await draftPlanResponse.json()).data.plan;
    const drillOnDraftResponse = await request.post(`${API_URL}/sst/emergency-drills`, {
      headers: withKey('drill-draft'),
      data: { planId: draftPlan.id, conductedAt: '2026-08-01' },
    });
    expect(drillOnDraftResponse.status()).toBe(409);

    // --- Formation SST liée à un employé RH ---
    const employeeResponse = await request.post(`${API_URL}/hr/employees`, {
      headers: withKey('employee'),
      data: { employeeNumber: `E2E-SST-${suffix}`, legalName: 'Employé SST E2E', hireDate: '2026-01-01' },
    });
    expect(employeeResponse.ok()).toBeTruthy();
    const employee = (await employeeResponse.json()).data.employee;

    const trainingResponse = await request.post(`${API_URL}/sst/training-assignments`, {
      headers: withKey('training'),
      data: { employeeId: employee.id, trainingCode: 'SIMDUT', title: 'Formation SIMDUT', dueAt: '2026-08-15' },
    });
    expect(trainingResponse.ok()).toBeTruthy();
    const assignment = (await trainingResponse.json()).data.assignment;

    await request.post(`${API_URL}/sst/training-assignments/${assignment.id}/transitions/start`, {
      headers: withKey('training-start'),
      data: {},
    });
    const completeTrainingResponse = await request.post(`${API_URL}/sst/training-assignments/${assignment.id}/transitions/complete`, {
      headers: withKey('training-complete'),
      data: { score: 90, evidence: ['certificat-simdut.pdf'] },
    });
    expect(completeTrainingResponse.ok()).toBeTruthy();
    expect((await completeTrainingResponse.json()).data.assignment.evidence).toEqual(['certificat-simdut.pdf']);

    const complianceResponse = await request.get(`${API_URL}/sst/employees/${employee.id}/training-compliance`, { headers });
    expect(complianceResponse.ok()).toBeTruthy();
    const compliance = (await complianceResponse.json()).data.compliance;
    expect(compliance.compliant).toBe(true);
    expect(compliance.completed).toBe(1);

    // --- Enquête d'incident : cycle complet jusqu'à la fermeture ---
    const investigationResponse = await request.post(`${API_URL}/sst/incidents/${incident.id}/investigation`, {
      headers: withKey('investigation'),
      data: {},
    });
    expect(investigationResponse.ok()).toBeTruthy();
    const investigation = (await investigationResponse.json()).data.investigation;
    expect(investigation.status).toBe('open');

    for (const action of ['collecting', 'analysis', 'review']) {
      const response = await request.post(`${API_URL}/sst/investigations/${investigation.id}/transitions/${action}`, {
        headers: withKey(`inv-${action}`),
        data: { rootCauses: ['Formation insuffisante'], evidence: ['photo-scene.jpg'] },
      });
      expect(response.ok()).toBeTruthy();
      expect((await response.json()).data.investigation.status).toBe(action);
    }

    // La fermeture sans cause racine ni preuve doit être refusée.
    const secondIncidentResponse = await request.post(`${API_URL}/sst/incidents`, {
      headers: withKey('incident2'),
      data: { incidentType: 'near_miss', occurredAt: '2026-08-01T10:00:00Z', location: 'Entrepôt B', description: 'Autre incident', severity: 2 },
    });
    const secondIncident = (await secondIncidentResponse.json()).data.incident;
    const secondInvestigationResponse = await request.post(`${API_URL}/sst/incidents/${secondIncident.id}/investigation`, {
      headers: withKey('investigation2'),
      data: {},
    });
    const secondInvestigation = (await secondInvestigationResponse.json()).data.investigation;
    await request.post(`${API_URL}/sst/investigations/${secondInvestigation.id}/transitions/collecting`, { headers: withKey('inv2-collecting'), data: {} });
    await request.post(`${API_URL}/sst/investigations/${secondInvestigation.id}/transitions/analysis`, { headers: withKey('inv2-analysis'), data: {} });
    await request.post(`${API_URL}/sst/investigations/${secondInvestigation.id}/transitions/review`, { headers: withKey('inv2-review'), data: {} });
    const incompleteCloseResponse = await request.post(`${API_URL}/sst/investigations/${secondInvestigation.id}/transitions/closed`, {
      headers: withKey('inv2-closed'),
      data: {},
    });
    expect(incompleteCloseResponse.status()).toBe(409);

    const closeInvestigationResponse = await request.post(`${API_URL}/sst/investigations/${investigation.id}/transitions/closed`, {
      headers: withKey('investigation-closed'),
      data: { rootCauses: ['Formation insuffisante'], evidence: ['photo-scene.jpg'] },
    });
    expect(closeInvestigationResponse.ok()).toBeTruthy();
    expect((await closeInvestigationResponse.json()).data.investigation.status).toBe('closed');

    // --- Alertes : fenêtres de relance et EPI à inspecter ---
    const alertsResponse = await request.get(`${API_URL}/sst/alerts`, { headers });
    expect(alertsResponse.ok()).toBeTruthy();
    const alerts = (await alertsResponse.json()).data;
    expect(alerts.ppeInspectionsDue.some((p) => p.asset_code === `EPI-${suffix}`)).toBe(true);
  });
});
