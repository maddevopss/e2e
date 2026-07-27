const { test, expect } = require('@playwright/test');

const API_URL = process.env.E2E_API_URL || process.env.BACKEND_URL || 'http://localhost:5000';
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('cycle comptable complet', () => {
  test.skip(!email || !password, 'Identifiants E2E requis');

  test('plan comptable, écriture, publication, balance et états restent cohérents', async ({ request }) => {
    const login = await request.post(`${API_URL}/api/login`, { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    const loginBody = await login.json();
    const token = loginBody?.data?.token || loginBody?.token || loginBody?.accessToken;
    expect(token).toBeTruthy();
    const headers = { Authorization: `Bearer ${token}` };

    const accountsResponse = await request.get(`${API_URL}/api/accounting/accounts`, { headers });
    expect(accountsResponse.ok()).toBeTruthy();
    const accountsBody = await accountsResponse.json();
    const accounts = accountsBody.accounts || accountsBody?.data?.accounts || [];
    expect(accounts.length).toBeGreaterThan(1);

    const debitAccount = accounts.find((account) => ['asset', 'expense'].includes(account.type)) || accounts[0];
    const creditAccount = accounts.find((account) => account.id !== debitAccount.id) || accounts[1];
    const idempotencyKey = `e2e-accounting-${Date.now()}`;

    const createEntry = await request.post(`${API_URL}/api/accounting/entries`, {
      headers,
      data: {
        entryDate: new Date().toISOString().slice(0, 10),
        description: 'Preuve E2E de fermeture comptable',
        idempotencyKey,
        lines: [
          { accountId: debitAccount.id, debit: 100, credit: 0, description: 'Débit E2E' },
          { accountId: creditAccount.id, debit: 0, credit: 100, description: 'Crédit E2E' },
        ],
      },
    });
    expect(createEntry.ok()).toBeTruthy();
    const entryBody = await createEntry.json();
    const entry = entryBody.entry || entryBody?.data?.entry;
    expect(entry?.id).toBeTruthy();

    const postEntry = await request.post(`${API_URL}/api/accounting/entries/${entry.id}/post`, { headers });
    expect(postEntry.ok()).toBeTruthy();

    const today = new Date().toISOString().slice(0, 10);
    const trialBalance = await request.get(`${API_URL}/api/accounting/trial-balance?endDate=${today}`, { headers });
    expect(trialBalance.ok()).toBeTruthy();
    const trialBody = await trialBalance.json();
    const totals = trialBody.totals || trialBody?.current?.totals || trialBody?.data?.totals || {};
    if (totals.debit !== undefined && totals.credit !== undefined) {
      expect(Number(totals.debit)).toBeCloseTo(Number(totals.credit), 2);
    }

    const statements = await request.get(`${API_URL}/api/accounting/statements?endDate=${today}`, { headers });
    expect(statements.ok()).toBeTruthy();
  });
});
