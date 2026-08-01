const { test, expect } = require('@playwright/test');
const { makeTestPassword } = require('./helpers/credentials');
const { unique } = require('./helpers/auth');
const { signupAndCompleteOnboardingUi } = require('./helpers/onboarding-ui');

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

    // Calcul : heures pour l'employé horaire, le salarié se calcule automatiquement
    const calculateResponse = await api(page.request, access.payrollBaseUrl, `/runs/${run.id}/calculate`, {
      method: 'POST',
      data: {
        idempotencyKey: unique('run-calc'),
        entries: [{ employeeId: hourlyEmployee.id, regularHours: 70, overtimeHours: 5 }],
      },
    });
    expect(calculateResponse.status()).toBe(201);
    const calculated = (await json(calculateResponse)).run;
    expect(Number(calculated.totals.gross)).toBeGreaterThan(0);

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

    // Rapprochement du cycle payé
    const reconciliationResponse = await api(page.request, access.payrollBaseUrl, `/remittances/reconciliation/runs/${run.id}`, {
      method: 'POST',
      data: { depositedNet: calculated.totals.net, remittedTotal: calculated.totals.deductions },
    });
    expect(reconciliationResponse.status()).toBe(201);
    const reconciliation = (await json(reconciliationResponse)).reconciliation;
    expect(['balanced', 'warning', 'blocked']).toContain(reconciliation.status);

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
