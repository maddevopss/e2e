const { test, expect } = require('@playwright/test');

const API_URL = process.env.TEST_API_URL || process.env.BACKEND_URL || process.env.API_URL || 'http://127.0.0.1:5000/api';
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('cycle complet ressources humaines', () => {
  test.skip(!email || !password, 'Identifiants E2E requis.');

  test('embauche, structure organisationnelle, absences, compétences, performance et départ', async ({ request }) => {
    const suffix = Date.now();
    const login = await request.post(`${API_URL}/login`, { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    const loginBody = await login.json();
    const token = loginBody?.data?.token || loginBody?.token;
    const headers = { Authorization: `Bearer ${token}` };
    const withKey = (key) => ({ ...headers, 'Idempotency-Key': `e2e-hr-${suffix}-${key}` });

    // --- Embauche et activation ---
    const employeeResponse = await request.post(`${API_URL}/hr/employees`, {
      headers: withKey('employee'),
      data: {
        employeeNumber: `E2E-HR-${suffix}`,
        legalName: 'Employé E2E HR',
        workEmail: `employe.hr.${suffix}@test.com`,
        hireDate: '2026-01-15',
        jobTitle: 'Technicien',
        department: 'Operations',
      },
    });
    expect(employeeResponse.ok()).toBeTruthy();
    const employee = (await employeeResponse.json()).data.employee;
    expect(employee.employment_status).toBe('draft');

    const activateResponse = await request.post(`${API_URL}/hr/employees/${employee.id}/transitions/activate`, {
      headers: withKey('activate'),
      data: {},
    });
    expect(activateResponse.ok()).toBeTruthy();
    expect((await activateResponse.json()).data.employee.employment_status).toBe('active');

    // --- Structure organisationnelle : département, rattachement, organigramme ---
    const departmentResponse = await request.post(`${API_URL}/hr/departments`, {
      headers: withKey('dept'),
      data: { code: `OPS-${suffix}`, name: 'Opérations E2E' },
    });
    expect(departmentResponse.ok()).toBeTruthy();
    const department = (await departmentResponse.json()).data.department;

    const assignResponse = await request.patch(`${API_URL}/hr/employees/${employee.id}/department`, {
      headers,
      data: { departmentId: department.id },
    });
    expect(assignResponse.ok()).toBeTruthy();
    expect((await assignResponse.json()).data.employee.department_id).toBe(department.id);

    const orgChartResponse = await request.get(`${API_URL}/hr/organisation-chart`, { headers });
    expect(orgChartResponse.ok()).toBeTruthy();
    const orgChart = (await orgChartResponse.json()).data;
    expect(orgChart.departments.some((d) => d.id === department.id)).toBe(true);
    expect(orgChart.employees.some((e) => e.id === employee.id && e.department_id === department.id)).toBe(true);

    // --- Absence : demande puis approbation ---
    const leaveResponse = await request.post(`${API_URL}/hr/leave-requests`, {
      headers: withKey('leave'),
      data: {
        employeeId: employee.id,
        leaveType: 'vacation',
        startDate: '2026-09-01',
        endDate: '2026-09-05',
        requestedUnits: 5,
        reason: 'Vacances E2E',
      },
    });
    expect(leaveResponse.ok()).toBeTruthy();
    const leaveRequest = (await leaveResponse.json()).data.leaveRequest;
    expect(leaveRequest.status).toBe('pending');

    const approveLeaveResponse = await request.post(`${API_URL}/hr/leave-requests/${leaveRequest.id}/approve`, {
      headers: withKey('leave-approve'),
      data: {},
    });
    expect(approveLeaveResponse.ok()).toBeTruthy();
    expect((await approveLeaveResponse.json()).data.request.status).toBe('approved');

    // --- Compétence : création puis vérification avec preuve ---
    const competencyResponse = await request.post(`${API_URL}/hr/competencies`, {
      headers,
      data: { code: `CPR-${suffix}`, name: 'Premiers soins', validityDays: 365, isRequired: true },
    });
    expect(competencyResponse.ok()).toBeTruthy();
    const competency = (await competencyResponse.json()).data.competency;

    const verifyResponse = await request.post(`${API_URL}/hr/employee-competencies`, {
      headers: withKey('competency'),
      data: {
        employeeId: employee.id,
        competencyId: competency.id,
        issuedAt: '2026-08-01',
        evidence: ['certificat-e2e.pdf'],
      },
    });
    expect(verifyResponse.ok()).toBeTruthy();
    const employeeCompetency = (await verifyResponse.json()).data.employeeCompetency;
    expect(employeeCompetency.status).toBe('valid');
    expect(employeeCompetency.evidence).toEqual(['certificat-e2e.pdf']);
    // La date d'expiration doit être dérivée de la durée de validité de la compétence (365 jours).
    expect(new Date(employeeCompetency.expires_at).getUTCFullYear()).toBe(2027);

    // --- Évaluation de performance : cycle complet jusqu'à la fermeture ---
    const reviewResponse = await request.post(`${API_URL}/hr/performance-reviews`, {
      headers: withKey('review'),
      data: { employeeId: employee.id, periodStart: '2026-01-01', periodEnd: '2026-06-30' },
    });
    expect(reviewResponse.ok()).toBeTruthy();
    const review = (await reviewResponse.json()).data.review;
    expect(review.status).toBe('draft');

    for (const action of ['employee_input', 'manager_review', 'acknowledged']) {
      const transitionResponse = await request.post(`${API_URL}/hr/performance-reviews/${review.id}/transitions/${action}`, {
        headers: withKey(`review-${action}`),
        data: {},
      });
      expect(transitionResponse.ok()).toBeTruthy();
      expect((await transitionResponse.json()).data.review.status).toBe(action);
    }

    const closeReviewResponse = await request.post(`${API_URL}/hr/performance-reviews/${review.id}/transitions/closed`, {
      headers: withKey('review-closed'),
      data: {
        overallRating: 4,
        objectives: [{ title: 'Objectif E2E', achieved: true }],
        competencies: [{ code: `CPR-${suffix}`, rating: 4 }],
        managerComments: 'Bon travail',
      },
    });
    expect(closeReviewResponse.ok()).toBeTruthy();
    expect((await closeReviewResponse.json()).data.review.status).toBe('closed');

    // La fermeture doit refuser une évaluation sans note ni objectifs/compétences évalués.
    const secondReviewResponse = await request.post(`${API_URL}/hr/performance-reviews`, {
      headers: withKey('review2'),
      data: { employeeId: employee.id, periodStart: '2026-07-01', periodEnd: '2026-12-31' },
    });
    const secondReview = (await secondReviewResponse.json()).data.review;
    const incompleteCloseResponse = await request.post(`${API_URL}/hr/performance-reviews/${secondReview.id}/transitions/closed`, {
      headers: withKey('review2-closed'),
      data: {},
    });
    expect(incompleteCloseResponse.status()).toBe(409);

    // --- Politique : assignation et accusé de réception ---
    const policyResponse = await request.post(`${API_URL}/hr/policy-acknowledgements`, {
      headers: withKey('policy'),
      data: { employeeId: employee.id, policyCode: `CODE-CONDUITE-${suffix}`, policyVersion: '1.0' },
    });
    expect(policyResponse.ok()).toBeTruthy();
    const acknowledgement = (await policyResponse.json()).data.acknowledgement;
    expect(acknowledgement.status).toBe('pending');

    const ackResponse = await request.post(`${API_URL}/hr/policy-acknowledgements/${acknowledgement.id}/acknowledge`, {
      headers: withKey('policy-ack'),
      data: {},
    });
    expect(ackResponse.ok()).toBeTruthy();
    expect((await ackResponse.json()).data.acknowledgement.status).toBe('acknowledged');

    // --- Départ : ouverture, préparation, fermeture bloquée puis débloquée ---
    const offboardingResponse = await request.post(`${API_URL}/hr/offboarding-cases`, {
      headers: withKey('offboarding'),
      data: { employeeId: employee.id, effectiveDate: '2026-12-31', reasonCode: 'resignation' },
    });
    expect(offboardingResponse.ok()).toBeTruthy();
    const offboardingCase = (await offboardingResponse.json()).data.offboardingCase;
    expect(offboardingCase.status).toBe('open');

    // Fermer un dossier sans confirmations doit être refusé (séparation des responsabilités).
    const prematureCloseResponse = await request.post(`${API_URL}/hr/offboarding-cases/${offboardingCase.id}/close`, {
      headers: withKey('offboarding-close-early'),
      data: {},
    });
    expect(prematureCloseResponse.status()).toBe(409);

    const updateReadinessResponse = await request.patch(`${API_URL}/hr/offboarding-cases/${offboardingCase.id}`, {
      headers,
      data: {
        payrollConfirmed: true,
        accessRevoked: true,
        propertyReturned: true,
        documentsCompleted: true,
      },
    });
    expect(updateReadinessResponse.ok()).toBeTruthy();
    expect((await updateReadinessResponse.json()).data.offboardingCase.status).toBe('in_progress');

    const closeOffboardingResponse = await request.post(`${API_URL}/hr/offboarding-cases/${offboardingCase.id}/close`, {
      headers: withKey('offboarding-close'),
      data: {},
    });
    expect(closeOffboardingResponse.ok()).toBeTruthy();
    expect((await closeOffboardingResponse.json()).data.offboardingCase.status).toBe('completed');

    // --- Cessation d'emploi ---
    const terminateResponse = await request.post(`${API_URL}/hr/employees/${employee.id}/transitions/terminate`, {
      headers: withKey('terminate'),
      data: { reason: 'Fin de contrat E2E', effectiveDate: '2026-12-31' },
    });
    expect(terminateResponse.ok()).toBeTruthy();
    expect((await terminateResponse.json()).data.employee.employment_status).toBe('terminated');

    // Une transition sans raison doit être refusée pour suspend/terminate.
    const secondEmployeeResponse = await request.post(`${API_URL}/hr/employees`, {
      headers: withKey('employee2'),
      data: { employeeNumber: `E2E-HR2-${suffix}`, legalName: 'Employé E2E HR 2', hireDate: '2026-01-15' },
    });
    const secondEmployee = (await secondEmployeeResponse.json()).data.employee;
    const missingReasonResponse = await request.post(`${API_URL}/hr/employees/${secondEmployee.id}/transitions/suspend`, {
      headers: withKey('suspend-no-reason'),
      data: {},
    });
    expect(missingReasonResponse.status()).toBe(400);
  });
});
