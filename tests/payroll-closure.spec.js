const { test, expect } = require('@playwright/test');
const { makeTestPassword } = require('./helpers/credentials');
const { unique } = require('./helpers/auth');
const { signupAndCompleteOnboardingUi, loginUi } = require('./helpers/onboarding-ui');

async function capturePayrollAccess(page) {
  // L'auth web repose sur des cookies httpOnly (pas de header Authorization) :
  // page.request partage le contexte de navigation, donc les cookies suivent.
  const requestPromise = page.waitForRequest((request) => request.url().includes('/payroll/employees'));
  await page.goto('/payroll');
  const payrollRequest = await requestPromise;
  const payrollBaseUrl = payrollRequest.url().replace(/\/payroll\/employees(?:\?.*)?$/, '/payroll');
  return {
    payrollBaseUrl,
    accountingBaseUrl: payrollBaseUrl.replace(/\/payroll$/, '/accounting'),
  };
}

async function api(requestContext, baseUrl, path, options = {}) {
  return requestContext.fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

// Les réponses API passent par l'enveloppe {success, code, data} (cf. api.jsx côté
// frontend qui la défait automatiquement) ; page.request.fetch() ne la défait pas.
async function json(response) {
  const body = await response.json();
  return body && typeof body === 'object' && 'data' in body ? body.data : body;
}

test.describe('Fermeture du module Paie', () => {
  test('cycle complet horaire/salarié, comptabilisation, opérations avancées et isolation multi-organisation', async ({ page, browser }) => {
    const password = makeTestPassword();
    const tenantA = {
      organisation: unique('Paie-A'),
      user: 'Administratrice paie A',
      email: `${unique('payroll-a')}@example.com`,
      password,
    };

    await signupAndCompleteOnboardingUi(page, tenantA);
    const access = await capturePayrollAccess(page);

    const seedResponse = await api(page.request, access.accountingBaseUrl, '/accounts/seed', { method: 'POST', data: {} });
    expect(seedResponse.ok()).toBeTruthy();
    const accounts = (await json(await api(page.request, access.accountingBaseUrl, '/accounts'))).accounts;
    const expenseAccount = accounts.find((account) => account.account_type === 'expense');
    const payableAccount = accounts.find((account) => account.account_type === 'liability');
    expect(expenseAccount).toBeTruthy();
    expect(payableAccount).toBeTruthy();

    // Période comptable ouverte couvrant la paie de janvier 2039 : la comptabilisation
    // d'un cycle de paie n'exige pas de période ouverte, mais son renversement
    // (correction) le vérifie via assertOpenAccountingPeriod.
    const accountingPeriodResponse = await api(page.request, access.accountingBaseUrl, '/periods', {
      method: 'POST',
      data: { fiscalYear: 2039, periodNumber: 1, startsOn: '2039-01-01', endsOn: '2039-01-31' },
    });
    expect(accountingPeriodResponse.status()).toBe(201);

    // Employé horaire
    const hourlyResponse = await api(page.request, access.payrollBaseUrl, '/employees', {
      method: 'POST',
      data: {
        employeeNumber: unique('EMP-H'),
        legalName: 'Alice Horaire',
        hireDate: '2039-01-01',
        payType: 'hourly',
        hourlyRate: 30,
        payFrequency: 'biweekly',
      },
    });
    expect(hourlyResponse.status()).toBe(201);
    const hourlyEmployee = (await json(hourlyResponse)).employee;

    // Employé salarié
    const salaryResponse = await api(page.request, access.payrollBaseUrl, '/employees', {
      method: 'POST',
      data: {
        employeeNumber: unique('EMP-S'),
        legalName: 'Bob Salarie',
        hireDate: '2039-01-01',
        payType: 'salary',
        annualSalary: 78000,
        payFrequency: 'biweekly',
      },
    });
    expect(salaryResponse.status()).toBe(201);
    const salaryEmployee = (await json(salaryResponse)).employee;

    // Jeu de règles et activation
    const rulesetResponse = await api(page.request, access.payrollBaseUrl, '/rulesets', {
      method: 'POST',
      data: {
        version: unique('v'),
        province: 'QC',
        effectiveFrom: '2039-01-01',
        rules: { employeeDeductions: {}, employerContributions: {}, voluntaryDeductions: {} },
      },
    });
    expect(rulesetResponse.status()).toBe(201);
    const ruleset = (await json(rulesetResponse)).ruleset;

    const activateResponse = await api(page.request, access.payrollBaseUrl, `/rulesets/${ruleset.id}/activate`, { method: 'POST', data: {} });
    expect(activateResponse.ok()).toBeTruthy();

    // Période de paie et cycle créé depuis la période
    const periodResponse = await api(page.request, access.payrollBaseUrl, '/periods', {
      method: 'POST',
      data: { frequency: 'biweekly', periodStart: '2039-01-01', periodEnd: '2039-01-14', payDate: '2039-01-16' },
    });
    expect(periodResponse.status()).toBe(201);
    const period = (await json(periodResponse)).period;

    const runResponse = await api(page.request, access.payrollBaseUrl, `/periods/${period.id}/runs`, {
      method: 'POST',
      data: { idempotencyKey: unique('run-create') },
    });
    expect([200, 201]).toContain(runResponse.status());
    const run = (await json(runResponse)).run;

    // Calcul : heures (+ prime) pour l'employé horaire, le salarié se calcule
    // automatiquement à partir du salaire annuel (+ commission).
    const calculateResponse = await api(page.request, access.payrollBaseUrl, `/runs/${run.id}/calculate`, {
      method: 'POST',
      data: {
        idempotencyKey: unique('run-calc'),
        entries: [
          { employeeId: hourlyEmployee.id, regularHours: 70, overtimeHours: 5, bonus: 250 },
          { employeeId: salaryEmployee.id, commission: 150 },
        ],
      },
    });
    expect(calculateResponse.status()).toBe(201);
    const calculated = (await json(calculateResponse)).run;
    expect(Number(calculated.totals.gross)).toBeGreaterThan(0);

    // Preuve que la prime et la commission entrent bien dans le brut : 70h à 30$ +
    // 5h supp. à 45$ + 250$ de prime = 2575$ ; salaire annuel/26 + 150$ de commission.
    const calculatedRunDetail = await json(await api(page.request, access.payrollBaseUrl, `/runs/${run.id}`));
    const hourlyLine = calculatedRunDetail.lines.find((line) => line.employee_number === hourlyEmployee.employee_number);
    const salaryLine = calculatedRunDetail.lines.find((line) => line.employee_number === salaryEmployee.employee_number);
    expect(Number(hourlyLine.gross_pay)).toBeCloseTo(2575, 2);
    expect(Number(salaryLine.gross_pay)).toBeCloseTo(78000 / 26 + 150, 2);

    // Approbation puis paiement
    const approveResponse = await api(page.request, access.payrollBaseUrl, `/runs/${run.id}/approve`, {
      method: 'POST',
      data: { idempotencyKey: unique('run-approve'), reason: 'Validation E2E' },
    });
    expect(approveResponse.status()).toBe(201);

    const payResponse = await api(page.request, access.payrollBaseUrl, `/runs/${run.id}/pay`, {
      method: 'POST',
      data: { idempotencyKey: unique('run-pay'), reason: 'Validation E2E' },
    });
    expect(payResponse.status()).toBe(201);

    // Comptabilisation réelle (draft → lignes → publiée) et vérification du lien
    const postAccountingResponse = await api(page.request, access.payrollBaseUrl, `/runs/${run.id}/post-accounting`, {
      method: 'POST',
      data: { expenseAccountId: expenseAccount.id, payableAccountId: payableAccount.id },
    });
    expect(postAccountingResponse.status()).toBe(201);
    const postedEntry = await json(postAccountingResponse);
    expect(postedEntry.entryId).toBeTruthy();

    const runDetail = await json(await api(page.request, access.payrollBaseUrl, `/runs/${run.id}`));
    expect(runDetail.run.accounting_entry_id).toBeTruthy();

    const entryDetail = await json(await api(page.request, access.accountingBaseUrl, `/entries/${runDetail.run.accounting_entry_id}`));
    expect(entryDetail.entry.status).toBe('posted');
    expect(entryDetail.totals.balanced).toBe(true);

    // Export contrôlé (#318, Sprint 7) : registre et talons en CSV
    const registerCsvResponse = await api(page.request, access.payrollBaseUrl, `/runs/${run.id}/register/export.csv`);
    expect(registerCsvResponse.ok()).toBeTruthy();
    expect(registerCsvResponse.headers()['content-type']).toContain('text/csv');
    expect(await registerCsvResponse.text()).toContain(hourlyEmployee.legal_name);

    const payStubsCsvResponse = await api(page.request, access.payrollBaseUrl, `/runs/${run.id}/pay-stubs/export.csv`);
    expect(payStubsCsvResponse.ok()).toBeTruthy();
    expect(payStubsCsvResponse.headers()['content-type']).toContain('text/csv');
    expect(await payStubsCsvResponse.text()).toContain(salaryEmployee.legal_name);

    // Rapprochement du cycle payé (avant sa correction : le rapprochement exige un
    // cycle approuvé ou payé, pas un cycle déjà corrigé)
    const reconciliationResponse = await api(page.request, access.payrollBaseUrl, `/remittances/reconciliation/runs/${run.id}`, {
      method: 'POST',
      data: { depositedNet: calculated.totals.net, remittedTotal: calculated.totals.deductions },
    });
    expect(reconciliationResponse.status()).toBe(201);
    const reconciliation = (await json(reconciliationResponse)).reconciliation;
    expect(['balanced', 'warning', 'blocked']).toContain(reconciliation.status);

    // Correction d'un cycle déjà payé : /void est réservé à avant paiement, la
    // correction doit renverser l'écriture publiée (non destructif) et distinguer
    // le cycle 'corrected' d'une simple annulation pré-paiement.
    const correctionIdempotencyKey = unique('run-correct');
    const correctionResponse = await api(page.request, access.payrollBaseUrl, `/runs/${run.id}/correct`, {
      method: 'POST',
      data: {
        idempotencyKey: correctionIdempotencyKey,
        reason: 'Correction E2E du cycle payé pour erreur de calcul',
        reversalDate: '2039-01-20',
        confirmedByHuman: true,
      },
    });
    expect(correctionResponse.status()).toBe(201);
    const correction = await json(correctionResponse);
    expect(correction.run.status).toBe('corrected');
    expect(correction.reversal.reversal.id).toBeTruthy();

    const reversedEntryDetail = await json(await api(page.request, access.accountingBaseUrl, `/entries/${runDetail.run.accounting_entry_id}`));
    expect(reversedEntryDetail.entry.status).toBe('reversed');
    expect(reversedEntryDetail.entry.reversed_by_entry_id).toBeTruthy();

    // Rejeu idempotent : même clé, aucune nouvelle correction ni renversement
    const duplicateCorrectionResponse = await api(page.request, access.payrollBaseUrl, `/runs/${run.id}/correct`, {
      method: 'POST',
      data: { idempotencyKey: correctionIdempotencyKey, reason: 'Correction E2E du cycle payé pour erreur de calcul', confirmedByHuman: true },
    });
    expect(duplicateCorrectionResponse.status()).toBe(200);
    expect((await json(duplicateCorrectionResponse)).duplicate).toBe(true);

    // Un cycle non payé ne peut pas être "corrigé" (seulement annulé)
    const invalidCorrectionResponse = await api(page.request, access.payrollBaseUrl, `/runs/${run.id}/correct`, {
      method: 'POST',
      data: { idempotencyKey: unique('run-correct-invalid'), reason: 'Tentative invalide après correction déjà appliquée', confirmedByHuman: true },
    });
    expect(invalidCorrectionResponse.status()).toBe(409);

    // Journal d'approbation (#318, Sprint 7) : chaque transition du cycle laisse une
    // trace horodatée, y compris la correction qui vient d'être appliquée.
    const runEvents = (await json(await api(page.request, access.payrollBaseUrl, `/runs/${run.id}/events`))).events;
    const runEventTypes = runEvents.map((event) => event.event_type);
    expect(runEventTypes).toEqual(expect.arrayContaining([
      'payroll.run.calculated',
      'payroll.run.approved',
      'payroll.run.paid',
      'payroll.run.corrected',
    ]));

    // Historique des modifications de rémunération (#318, Sprint 7) : l'embauche
    // laisse une trace consultable dans payroll_compensation_history.
    const compensationHistory = (await json(await api(page.request, access.payrollBaseUrl, `/employees/${hourlyEmployee.id}/compensation-history`))).history;
    expect(compensationHistory.length).toBeGreaterThan(0);
    expect(compensationHistory[0].reason).toBe('Embauche');

    // Second cycle pour prouver l'annulation (void) d'un cycle approuvé
    const period2 = (await json(await api(page.request, access.payrollBaseUrl, '/periods', {
      method: 'POST',
      data: { frequency: 'biweekly', periodStart: '2039-01-15', periodEnd: '2039-01-28', payDate: '2039-01-30' },
    }))).period;
    const run2 = (await json(await api(page.request, access.payrollBaseUrl, `/periods/${period2.id}/runs`, {
      method: 'POST',
      data: { idempotencyKey: unique('run2-create') },
    }))).run;
    await api(page.request, access.payrollBaseUrl, `/runs/${run2.id}/calculate`, {
      method: 'POST',
      data: { idempotencyKey: unique('run2-calc'), entries: [] },
    });
    const approve2Response = await api(page.request, access.payrollBaseUrl, `/runs/${run2.id}/approve`, {
      method: 'POST',
      data: { idempotencyKey: unique('run2-approve'), reason: 'Validation E2E' },
    });
    expect(approve2Response.status()).toBe(201);
    const void2Response = await api(page.request, access.payrollBaseUrl, `/runs/${run2.id}/void`, {
      method: 'POST',
      data: { idempotencyKey: unique('run2-void'), reason: 'Annulation E2E' },
    });
    expect(void2Response.status()).toBe(201);
    expect((await json(void2Response)).run.status).toBe('void');

    // Fin d'emploi : brouillon → approuvé → émis
    const termination = (await json(await api(page.request, access.payrollBaseUrl, '/remittances/terminations', {
      method: 'POST',
      data: { employeeId: hourlyEmployee.id, lastWorkedDate: '2039-02-01', finalPayDate: '2039-02-05', reasonCode: 'resignation' },
    }))).termination;

    const terminationApprove = await api(page.request, access.payrollBaseUrl, `/remittances/terminations/${termination.id}/approve`, { method: 'POST', data: {} });
    expect(terminationApprove.ok()).toBeTruthy();
    const terminationIssue = await api(page.request, access.payrollBaseUrl, `/remittances/terminations/${termination.id}/issue`, {
      method: 'POST',
      data: { roeReference: unique('ROE') },
    });
    expect(terminationIssue.ok()).toBeTruthy();
    expect((await json(terminationIssue)).termination.status).toBe('issued');

    // Feuillet de fin d'année : brouillon → validé → émis, puis correction (amend)
    const slip = (await json(await api(page.request, access.payrollBaseUrl, '/remittances/year-end-slips', {
      method: 'POST',
      data: {
        employeeId: salaryEmployee.id,
        taxYear: 2039,
        slipType: 'T4',
        earnings: 78000,
        tax: 15000,
        pension: 4000,
        insurance: 900,
        other: {},
      },
    }))).slip;

    const slipValidate = await api(page.request, access.payrollBaseUrl, `/remittances/year-end-slips/${slip.id}/validate`, { method: 'POST', data: {} });
    expect(slipValidate.ok()).toBeTruthy();
    const slipIssue = await api(page.request, access.payrollBaseUrl, `/remittances/year-end-slips/${slip.id}/issue`, {
      method: 'POST',
      data: { approvalReference: unique('APPR') },
    });
    expect(slipIssue.ok()).toBeTruthy();

    const slipAmend = await api(page.request, access.payrollBaseUrl, `/remittances/year-end-slips/${slip.id}/amend`, {
      method: 'POST',
      data: { earnings: 79000, tax: 15500, pension: 4100, insurance: 920, other: {} },
    });
    expect(slipAmend.status()).toBe(201);
    const amendedSlip = (await json(slipAmend)).slip;
    expect(String(amendedSlip.amended_from_id)).toBe(String(slip.id));

    // Séparation préparateur/approbateur (#318, #363) : un manager prépare mais ne
    // peut pas approuver ; un employé n'a aucun accès aux données de préparation
    // mais consulte son propre talon de paie, jamais celui d'un collègue.
    const apiBaseUrl = access.payrollBaseUrl.replace(/\/payroll$/, '');
    const managerPassword = makeTestPassword();
    const managerEmail = `${unique('payroll-manager')}@example.com`;
    const managerCreateResponse = await api(page.request, apiBaseUrl, '/users', {
      method: 'POST',
      data: { nom: 'Gestionnaire Paie', email: managerEmail, password: managerPassword, role: 'manager' },
    });
    expect(managerCreateResponse.status()).toBe(201);

    const employeePassword = makeTestPassword();
    const employeeEmail = `${unique('payroll-employe')}@example.com`;
    const employeeCreateResponse = await api(page.request, apiBaseUrl, '/users', {
      method: 'POST',
      data: { nom: 'Employé Libre-Service', email: employeeEmail, password: employeePassword, role: 'employe' },
    });
    expect(employeeCreateResponse.status()).toBe(201);
    const linkedUserId = (await json(employeeCreateResponse)).id;

    const selfServiceEmployee = (await json(await api(page.request, access.payrollBaseUrl, '/employees', {
      method: 'POST',
      data: {
        employeeNumber: unique('SELF'),
        legalName: 'Employe LibreService',
        hireDate: '2039-01-01',
        payType: 'salary',
        annualSalary: 52000,
        payFrequency: 'biweekly',
        userId: linkedUserId,
      },
    }))).employee;

    const permsPeriod = (await json(await api(page.request, access.payrollBaseUrl, '/periods', {
      method: 'POST',
      data: { frequency: 'biweekly', periodStart: '2039-02-01', periodEnd: '2039-02-14', payDate: '2039-02-16' },
    }))).period;
    const permsRun = (await json(await api(page.request, access.payrollBaseUrl, `/periods/${permsPeriod.id}/runs`, {
      method: 'POST',
      data: { idempotencyKey: unique('perms-run-create') },
    }))).run;
    await api(page.request, access.payrollBaseUrl, `/runs/${permsRun.id}/calculate`, {
      method: 'POST',
      data: { idempotencyKey: unique('perms-run-calc'), entries: [] },
    });

    const managerContext = await browser.newContext();
    const managerPage = await managerContext.newPage();
    await loginUi(managerPage, { email: managerEmail, password: managerPassword });

    const managerPrepareResponse = await api(managerPage.request, access.payrollBaseUrl, '/employees', {
      method: 'POST',
      data: { employeeNumber: unique('MGR'), legalName: 'Cree Par Gestionnaire', hireDate: '2039-01-01', payType: 'salary', annualSalary: 51000, payFrequency: 'biweekly' },
    });
    expect(managerPrepareResponse.status()).toBe(201);

    const managerApproveResponse = await api(managerPage.request, access.payrollBaseUrl, `/runs/${permsRun.id}/approve`, {
      method: 'POST',
      data: { idempotencyKey: unique('perms-run-approve-mgr'), reason: 'Tentative gestionnaire' },
    });
    expect(managerApproveResponse.status()).toBe(403);
    await managerContext.close();

    const employeeContext = await browser.newContext();
    const employeePage = await employeeContext.newPage();
    await loginUi(employeePage, { email: employeeEmail, password: employeePassword });

    const employeeListResponse = await api(employeePage.request, access.payrollBaseUrl, '/employees');
    expect(employeeListResponse.status()).toBe(403);

    const employeeStubResponse = await api(employeePage.request, access.payrollBaseUrl, `/runs/${permsRun.id}/pay-stubs`);
    expect(employeeStubResponse.status()).toBe(200);
    const employeeStubs = (await json(employeeStubResponse)).payStubs;
    expect(employeeStubs).toHaveLength(1);
    expect(employeeStubs[0].employeeNumber).toBe(selfServiceEmployee.employee_number);
    await employeeContext.close();

    // Isolation multi-organisation
    const tenantBContext = await browser.newContext();
    const tenantBPage = await tenantBContext.newPage();
    await signupAndCompleteOnboardingUi(tenantBPage, {
      organisation: unique('Paie-B'),
      user: 'Administratrice paie B',
      email: `${unique('payroll-b')}@example.com`,
      password,
    });
    const accessB = await capturePayrollAccess(tenantBPage);

    const employeesB = await json(await api(tenantBPage.request, accessB.payrollBaseUrl, '/employees'));
    expect((employeesB.employees || []).length).toBe(0);

    const runsB = await json(await api(tenantBPage.request, accessB.payrollBaseUrl, '/runs'));
    expect((runsB.runs || []).some((candidate) => String(candidate.id) === String(run.id))).toBeFalsy();

    const forbiddenRunDetail = await api(tenantBPage.request, accessB.payrollBaseUrl, `/runs/${run.id}`);
    expect(forbiddenRunDetail.status()).toBe(404);

    const terminationsB = await json(await api(tenantBPage.request, accessB.payrollBaseUrl, '/remittances/terminations'));
    expect((terminationsB.terminations || []).length).toBe(0);

    const slipsB = await json(await api(tenantBPage.request, accessB.payrollBaseUrl, '/remittances/year-end-slips'));
    expect((slipsB.slips || []).length).toBe(0);

    await tenantBContext.close();
  });
});
