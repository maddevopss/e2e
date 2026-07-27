const { test, expect } = require('@playwright/test');
const { unique } = require('./helpers/auth');
const { signupAndCompleteOnboardingUi } = require('./helpers/onboarding-ui');

async function captureAccountingAccess(page) {
  const requestPromise = page.waitForRequest((request) => (
    request.url().includes('/accounting/accounts')
      && Boolean(request.headers().authorization)
  ));
  await page.goto('/accounting');
  const accountingRequest = await requestPromise;
  return {
    authorization: accountingRequest.headers().authorization,
    accountingBaseUrl: accountingRequest.url().replace(/\/accounting\/accounts(?:\?.*)?$/, '/accounting'),
  };
}

async function api(request, access, path, options = {}) {
  return request.fetch(`${access.accountingBaseUrl}${path}`, {
    ...options,
    headers: {
      authorization: access.authorization,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

test.describe('Fermeture du module Comptabilité', () => {
  test('cycle complet, rapports, exports, gouvernance et isolation multi-organisation', async ({ page, browser, request }) => {
    const password = 'TestPassword123!';
    const tenantA = {
      organisation: unique('Comptabilite-A'),
      user: 'Administrateur comptable A',
      email: `${unique('accounting-a')}@example.com`,
      password,
    };

    await signupAndCompleteOnboardingUi(page, tenantA);
    const accessA = await captureAccountingAccess(page);

    const seedResponse = await api(request, accessA, '/accounts/seed', { method: 'POST', data: {} });
    expect(seedResponse.ok()).toBeTruthy();

    const accountsResponse = await api(request, accessA, '/accounts');
    expect(accountsResponse.ok()).toBeTruthy();
    const accounts = (await accountsResponse.json()).accounts;
    const debitAccount = accounts.find((account) => account.account_type === 'asset');
    const creditAccount = accounts.find((account) => account.account_type === 'revenue')
      || accounts.find((account) => account.account_type === 'liability');
    expect(debitAccount).toBeTruthy();
    expect(creditAccount).toBeTruthy();

    const previousPeriodResponse = await api(request, accessA, '/periods', {
      method: 'POST',
      data: { fiscalYear: 2039, periodNumber: 12, startsOn: '2039-12-01', endsOn: '2039-12-31' },
    });
    expect(previousPeriodResponse.status()).toBe(201);

    const currentPeriodResponse = await api(request, accessA, '/periods', {
      method: 'POST',
      data: { fiscalYear: 2040, periodNumber: 1, startsOn: '2040-01-01', endsOn: '2040-01-31' },
    });
    expect(currentPeriodResponse.status()).toBe(201);
    const currentPeriod = (await currentPeriodResponse.json()).period;

    const entryResponse = await api(request, accessA, '/entries', {
      method: 'POST',
      data: {
        entryDate: '2040-01-15',
        description: 'Preuve de fermeture comptable',
        entryNumber: unique('E2E-ACC'),
        lines: [
          { accountId: debitAccount.id, debit: 125.5, credit: 0 },
          { accountId: creditAccount.id, debit: 0, credit: 125.5 },
        ],
      },
    });
    expect(entryResponse.status()).toBe(201);
    const entry = (await entryResponse.json()).entry;

    const postResponse = await api(request, accessA, `/entries/${entry.id}/post`, { method: 'POST', data: {} });
    expect(postResponse.ok()).toBeTruthy();

    const detailResponse = await api(request, accessA, `/entries/${entry.id}`);
    expect(detailResponse.ok()).toBeTruthy();
    const detail = await detailResponse.json();
    expect(detail.totals).toMatchObject({ debit: 125.5, credit: 125.5, balanced: true });
    expect(detail.entry.status).toBe('posted');

    const ledgerResponse = await api(request, accessA, `/ledger?startDate=2040-01-01&endDate=2040-01-31&accountId=${debitAccount.id}&sourceType=&clientId=`);
    expect(ledgerResponse.ok()).toBeTruthy();
    const ledger = await ledgerResponse.json();
    expect(JSON.stringify(ledger)).toContain(String(entry.id));

    const balanceResponse = await api(request, accessA, '/trial-balance?startDate=2040-01-01&endDate=2040-01-31&previousStartDate=2039-12-01&previousEndDate=2039-12-31');
    expect(balanceResponse.ok()).toBeTruthy();
    const balance = await balanceResponse.json();
    expect(balance.isBalanced).toBe(true);
    expect(balance.rows.some((row) => String(row.accountId) === String(debitAccount.id))).toBe(true);

    const statementsResponse = await api(request, accessA, '/statements?startDate=2040-01-01&endDate=2040-01-31&previousStartDate=2039-12-01&previousEndDate=2039-12-31');
    expect(statementsResponse.ok()).toBeTruthy();
    const statements = await statementsResponse.json();
    expect(statements.statements || statements).toHaveProperty('incomeStatement');
    expect(statements.statements || statements).toHaveProperty('balanceSheet');
    expect(statements.statements || statements).toHaveProperty('cashFlow');

    const balanceCsv = await api(request, accessA, '/exports/trial-balance.csv?startDate=2040-01-01&endDate=2040-01-31');
    expect(balanceCsv.ok()).toBeTruthy();
    expect(balanceCsv.headers()['content-type']).toContain('text/csv');
    expect((await balanceCsv.text()).length).toBeGreaterThan(20);

    const journalCsv = await api(request, accessA, '/exports/journal.csv?startDate=2040-01-01&endDate=2040-01-31');
    expect(journalCsv.ok()).toBeTruthy();
    expect(journalCsv.headers()['content-type']).toContain('text/csv');
    expect(await journalCsv.text()).toContain('Preuve de fermeture comptable');

    const reversalResponse = await api(request, accessA, `/entries/${entry.id}/reverse`, {
      method: 'POST',
      data: {
        reversalDate: '2040-01-20',
        reason: 'Validation de la contrepassation E2E',
        idempotencyKey: unique('accounting-reversal'),
      },
    });
    expect([200, 201]).toContain(reversalResponse.status());

    const closeResponse = await api(request, accessA, `/periods/${currentPeriod.id}/close`, {
      method: 'POST',
      data: { reason: 'Validation de fermeture E2E' },
    });
    expect([200, 201]).toContain(closeResponse.status());

    const reopenResponse = await api(request, accessA, `/periods/${currentPeriod.id}/reopen`, {
      method: 'POST',
      data: { reason: 'Validation de réouverture E2E' },
    });
    expect([200, 201]).toContain(reopenResponse.status());

    const tenantBContext = await browser.newContext();
    const tenantBPage = await tenantBContext.newPage();
    await signupAndCompleteOnboardingUi(tenantBPage, {
      organisation: unique('Comptabilite-B'),
      user: 'Administrateur comptable B',
      email: `${unique('accounting-b')}@example.com`,
      password,
    });
    const accessB = await captureAccountingAccess(tenantBPage);

    const forbiddenDetail = await api(request, accessB, `/entries/${entry.id}`);
    expect(forbiddenDetail.status()).toBe(404);

    const tenantBLedger = await api(request, accessB, '/ledger?startDate=2040-01-01&endDate=2040-01-31');
    expect(tenantBLedger.ok()).toBeTruthy();
    expect(JSON.stringify(await tenantBLedger.json())).not.toContain(String(entry.id));

    await tenantBContext.close();
  });
});
