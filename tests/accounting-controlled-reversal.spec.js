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

test.describe('Renversement comptable contrôlé', () => {
  test('prévisualise, confirme, lie et bloque un second renversement', async ({ page, request }) => {
    await signupAndCompleteOnboardingUi(page, {
      organisation: unique('Renversement-comptable'),
      user: 'Responsable comptable E2E',
      email: `${unique('accounting-reversal')}@example.com`,
      password: 'TestPassword123!',
    });

    const access = await captureAccountingAccess(page);

    const seedAccounts = await api(request, access, '/accounts/seed', { method: 'POST', data: {} });
    expect(seedAccounts.ok()).toBeTruthy();

    const accountsResponse = await api(request, access, '/accounts');
    expect(accountsResponse.ok()).toBeTruthy();
    const accounts = (await accountsResponse.json()).accounts;
    const debitAccount = accounts.find((account) => account.code === '1100')
      || accounts.find((account) => account.account_type === 'asset');
    const creditAccount = accounts.find((account) => account.code === '4000')
      || accounts.find((account) => account.account_type === 'revenue');
    expect(debitAccount).toBeTruthy();
    expect(creditAccount).toBeTruthy();

    const amount = 84.25;
    const entryResponse = await api(request, access, '/entries', {
      method: 'POST',
      data: {
        entryDate: '2040-03-01',
        description: 'Écriture publiée à renverser E2E',
        journalCode: 'GEN',
        lines: [
          { accountId: debitAccount.id, debit: amount, credit: 0 },
          { accountId: creditAccount.id, debit: 0, credit: amount },
        ],
      },
    });
    expect(entryResponse.status()).toBe(201);
    const created = await entryResponse.json();
    const entryId = created.entry.id;

    const postResponse = await api(request, access, `/entries/${entryId}/post`, {
      method: 'POST',
      data: {},
    });
    expect(postResponse.ok()).toBeTruthy();

    const previewResponse = await api(request, access, `/entries/${entryId}/reversal/preview`, {
      method: 'POST',
      data: {
        reversalDate: '2040-03-02',
        reason: 'Renversement contrôlé après validation humaine complète.',
      },
    });
    expect(previewResponse.ok()).toBeTruthy();
    const preview = await previewResponse.json();
    expect(preview).toMatchObject({
      mode: 'preview',
      mutatesAccounting: false,
      requiresHumanConfirmation: true,
      original: { id: entryId },
      proposedReversal: {
        totals: { debit: amount, credit: amount },
      },
    });
    expect(preview.proposedReversal.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: debitAccount.id, debit: 0, credit: amount }),
      expect.objectContaining({ accountId: creditAccount.id, debit: amount, credit: 0 }),
    ]));

    const beforeApply = await api(request, access, `/entries/${entryId}`);
    const beforeDetail = await beforeApply.json();
    expect(beforeDetail.entry.reversed_by_entry_id).toBeFalsy();

    const missingConfirmation = await api(request, access, `/entries/${entryId}/reverse`, {
      method: 'POST',
      data: {
        reversalDate: '2040-03-02',
        reason: 'Renversement contrôlé après validation humaine complète.',
        idempotencyKey: unique('accounting-reversal-no-confirmation'),
      },
    });
    expect(missingConfirmation.status()).toBe(400);

    const applyResponse = await api(request, access, `/entries/${entryId}/reverse`, {
      method: 'POST',
      data: {
        reversalDate: '2040-03-02',
        reason: 'Renversement contrôlé après validation humaine complète.',
        confirmedByHuman: true,
        idempotencyKey: unique('accounting-reversal'),
      },
    });
    expect([200, 201]).toContain(applyResponse.status());
    const applied = await applyResponse.json();
    expect(applied).toMatchObject({
      duplicate: false,
      proof: {
        beforeStatus: 'posted',
        afterStatus: 'reversed',
        originalEntryId: entryId,
        originalPreserved: true,
        confirmedByHuman: true,
      },
    });
    expect(applied.proof.reversalEntryId).toBeTruthy();
    expect(applied.original.reversed_by_entry_id).toBe(applied.proof.reversalEntryId);
    expect(applied.reversal.reversal_of_entry_id).toBe(entryId);

    const secondAttempt = await api(request, access, `/entries/${entryId}/reverse`, {
      method: 'POST',
      data: {
        reversalDate: '2040-03-03',
        reason: 'Deuxième tentative de renversement qui doit être refusée.',
        confirmedByHuman: true,
        idempotencyKey: unique('accounting-reversal-second'),
      },
    });
    expect(secondAttempt.status()).toBe(409);
  });
});
