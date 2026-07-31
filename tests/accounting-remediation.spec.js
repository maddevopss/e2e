const { execFileSync } = require('child_process');
const { test, expect } = require('@playwright/test');
const { makeTestPassword } = require('./helpers/credentials');
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

function organisationIdFromAuthorization(authorization) {
  const token = String(authorization || '').replace(/^Bearer\s+/i, '');
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  const organisationId = payload.organisation_id || payload.organisationId || payload.org_id;
  if (!organisationId) throw new Error('organisation_id absent du jeton E2E');
  return Number(organisationId);
}

function quote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function seedMissingAccountingSource({ organisationId, sourceType, sourceId, amount }) {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL est obligatoire pour le scénario de correction comptable réelle.');
  }
  const sql = `
    INSERT INTO ledger_entries
      (organisation_id, type, amount, currency, reference_type, reference_id)
    VALUES
      (${Number(organisationId)}, 'e2e_remediation_fixture', ${Number(amount).toFixed(2)}, 'CAD', ${quote(sourceType)}, ${quote(sourceId)});
  `;
  execFileSync('psql', [process.env.DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    stdio: 'pipe',
    env: process.env,
  });
}

test.describe('Correction comptable contrôlée', () => {
  test('prévisualise, confirme, applique et prouve la résolution réelle', async ({ page, request }) => {
    const password = makeTestPassword();
    await signupAndCompleteOnboardingUi(page, {
      organisation: unique('Correction-comptable'),
      user: 'Responsable comptable E2E',
      email: `${unique('accounting-remediation')}@example.com`,
      password,
    });

    const access = await captureAccountingAccess(page);
    const organisationId = organisationIdFromAuthorization(access.authorization);

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

    const sourceType = 'e2e_remediation';
    const sourceId = unique('source');
    const amount = 42.5;
    seedMissingAccountingSource({ organisationId, sourceType, sourceId, amount });

    const beforeResponse = await api(request, access, '/reconciliation');
    expect(beforeResponse.ok()).toBeTruthy();
    const before = await beforeResponse.json();
    const anomaly = before.anomalies.find((item) => (
      item.sourceType === sourceType && String(item.sourceId) === sourceId
    ));
    expect(anomaly).toMatchObject({
      status: 'missing_entry',
      sourceAmount: amount,
      remediation: { action: 'create_adjustment' },
    });

    const command = {
      sourceType,
      sourceId,
      entryDate: '2040-02-15',
      description: 'Correction réelle E2E du rapprochement',
      lines: [
        { accountId: debitAccount.id, debit: amount, credit: 0 },
        { accountId: creditAccount.id, debit: 0, credit: amount },
      ],
    };

    const previewResponse = await api(request, access, '/reconciliation/remediation/preview', {
      method: 'POST',
      data: command,
    });
    expect(previewResponse.ok()).toBeTruthy();
    const preview = await previewResponse.json();
    expect(preview).toMatchObject({
      mode: 'preview',
      mutatesAccounting: false,
      requiresHumanConfirmation: true,
      proposedEntry: { totals: { debit: amount, credit: amount } },
    });

    const stillBeforeResponse = await api(request, access, '/reconciliation');
    const stillBefore = await stillBeforeResponse.json();
    expect(stillBefore.anomalies.some((item) => (
      item.sourceType === sourceType && String(item.sourceId) === sourceId
    ))).toBe(true);

    const applyResponse = await api(request, access, '/reconciliation/remediation/apply', {
      method: 'POST',
      data: {
        ...command,
        confirmedByHuman: true,
        reason: 'Correction confirmée après vérification des comptes et du montant.',
        idempotencyKey: unique('accounting-remediation'),
      },
    });
    expect([200, 201]).toContain(applyResponse.status());
    const applied = await applyResponse.json();
    expect(applied).toMatchObject({
      resolved: true,
      confirmedByHuman: true,
      proof: {
        beforeStatus: 'missing_entry',
        afterStatus: 'resolved',
        linkedSourceType: `accounting_adjustment_${sourceType}`,
        linkedSourceId: sourceId,
      },
    });
    expect(applied.proof.entryId).toBeTruthy();

    const afterResponse = await api(request, access, '/reconciliation');
    expect(afterResponse.ok()).toBeTruthy();
    const after = await afterResponse.json();
    expect(after.anomalies.some((item) => (
      item.sourceType === sourceType && String(item.sourceId) === sourceId
    ))).toBe(false);
    expect(after.balanced).toBeGreaterThanOrEqual(1);
  });
});
