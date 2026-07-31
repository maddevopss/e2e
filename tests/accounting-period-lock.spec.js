const { test, expect } = require('@playwright/test');
const { makeTestPassword } = require('./helpers/credentials');
const { unique } = require('./helpers/auth');
const { signupAndCompleteOnboardingUi } = require('./helpers/onboarding-ui');

async function captureAccountingAccess(page) {
  const requestPromise = page.waitForRequest((request) => (
    request.url().includes('/accounting/accounts') && Boolean(request.headers().authorization)
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

async function entries(request, access) {
  const response = await api(request, access, '/entries');
  expect(response.ok()).toBeTruthy();
  return (await response.json()).entries;
}

test.describe('Verrou des périodes comptables', () => {
  test('refuse création, publication et contrepassation sans déplacer la date', async ({ page, request }) => {
    await signupAndCompleteOnboardingUi(page, {
      organisation: unique('Verrou-periode'),
      user: 'Responsable comptable E2E',
      email: `${unique('accounting-period-lock')}@example.com`,
      password: makeTestPassword(),
    });

    const access = await captureAccountingAccess(page);
    expect((await api(request, access, '/accounts/seed', { method: 'POST', data: {} })).ok()).toBeTruthy();

    const accounts = (await (await api(request, access, '/accounts')).json()).accounts;
    const debitAccount = accounts.find((account) => account.account_type === 'asset') || accounts[0];
    const creditAccount = accounts.find((account) => account.account_type === 'revenue') || accounts.find((account) => account.id !== debitAccount.id);

    const closedPeriodResponse = await api(request, access, '/periods', {
      method: 'POST',
      data: { fiscalYear: 2042, periodNumber: 1, startsOn: '2042-01-01', endsOn: '2042-01-31' },
    });
    const closedPeriod = (await closedPeriodResponse.json()).period;

    const openPeriodResponse = await api(request, access, '/periods', {
      method: 'POST',
      data: { fiscalYear: 2042, periodNumber: 2, startsOn: '2042-02-01', endsOn: '2042-02-28' },
    });
    const openPeriod = (await openPeriodResponse.json()).period;

    const existingResponse = await api(request, access, '/entries', {
      method: 'POST',
      data: {
        entryDate: '2042-01-15',
        description: 'Écriture créée avant fermeture',
        journalCode: 'GEN',
        lines: [
          { accountId: debitAccount.id, debit: 75, credit: 0 },
          { accountId: creditAccount.id, debit: 0, credit: 75 },
        ],
      },
    });
    expect(existingResponse.status()).toBe(201);
    const existing = (await existingResponse.json()).entry;

    const closeResponse = await api(request, access, `/periods/${closedPeriod.id}/close`, {
      method: 'POST',
      data: { reason: 'Fermeture E2E après validation de la période.' },
    });
    expect([200, 201]).toContain(closeResponse.status());

    const before = await entries(request, access);

    const createRefusalResponse = await api(request, access, '/entries', {
      method: 'POST',
      data: {
        entryDate: '2042-01-20',
        description: 'Création interdite en période fermée',
        journalCode: 'GEN',
        lines: [
          { accountId: debitAccount.id, debit: 50, credit: 0 },
          { accountId: creditAccount.id, debit: 0, credit: 50 },
        ],
      },
    });
    expect(createRefusalResponse.status()).toBe(409);
    const createRefusal = await createRefusalResponse.json();
    expect(createRefusal).toMatchObject({
      code: 'accounting_period.closed',
      details: {
        entryDate: '2042-01-20',
        requiresHumanDecision: true,
        mutatesAccounting: false,
        nextOpenPeriod: { id: openPeriod.id, startsOn: '2042-02-01' },
      },
    });

    const postRefusalResponse = await api(request, access, `/entries/${existing.id}/post`, { method: 'POST', data: {} });
    expect(postRefusalResponse.status()).toBe(409);
    const postRefusal = await postRefusalResponse.json();
    expect(postRefusal.details.entryDate).toBe('2042-01-15');

    const reversalRefusalResponse = await api(request, access, `/entries/${existing.id}/reverse`, {
      method: 'POST',
      data: {
        reversalDate: '2042-01-25',
        reason: 'Contrepassation E2E refusée dans la période fermée.',
        confirmedByHuman: true,
        idempotencyKey: unique('period-lock-reversal'),
      },
    });
    expect(reversalRefusalResponse.status()).toBe(409);
    const reversalRefusal = await reversalRefusalResponse.json();
    expect(reversalRefusal).toMatchObject({
      code: 'accounting_period.closed',
      details: { entryDate: '2042-01-25', mutatesAccounting: false },
    });

    const after = await entries(request, access);
    expect(after).toHaveLength(before.length);
    expect(after.some((entry) => entry.entry_date === '2042-02-01' && entry.description?.includes('interdite'))).toBe(false);

    const detailResponse = await api(request, access, `/entries/${existing.id}`);
    const detail = await detailResponse.json();
    expect(detail.entry.status).toBe('draft');
    expect(detail.entry.reversed_by_entry_id).toBeFalsy();
  });
});
