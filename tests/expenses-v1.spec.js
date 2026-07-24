const { test, expect } = require('@playwright/test');
const { apiUrl, apiRequest, entity, signup, unique } = require('./helpers/auth');

function authHeaders(authorization, extra = {}) {
  return { Authorization: authorization, ...extra };
}

test.describe('Dépenses V1', () => {
  test('création, filtres, preuve privée, modification, suppression et isolation', async ({ browser }) => {
    const password = 'TestPassword123!';
    const supplier = unique('Fournisseur-depense');
    const updatedSupplier = `${supplier}-modifie`;
    const receiptName = 'preuve-achat.png';
    const receiptBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    ]);

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const authorizationA = await signup(pageA, {
      organisation: unique('Organisation-depenses-A'),
      user: 'Administrateur Dépenses A',
      email: `${unique('expenses-admin-a')}@example.com`,
      password,
    });

    const created = await apiRequest(contextA, authorizationA, 'POST', '/expenses', {
      supplier,
      category: 'supplies',
      amount: 100,
      tax_amount: 14.98,
      total_amount: 114.98,
      expense_date: new Date().toISOString().slice(0, 10),
      description: 'Fournitures de bureau pour la preuve E2E.',
      currency: 'CAD',
      projet_id: null,
    });
    const expense = entity(created.body, 'expense');
    expect(expense.id).toBeTruthy();
    expect(Number(expense.total_amount)).toBe(114.98);

    await pageA.goto('/expenses');
    await expect(pageA.getByRole('heading', { name: 'Dépenses enregistrées' })).toBeVisible();
    await expect(pageA.getByText(supplier, { exact: true })).toBeVisible();
    await expect(pageA.getByText('114,98 $')).toBeVisible();

    await pageA.getByRole('button', { name: 'Modifier' }).click();
    await expect(pageA.getByRole('heading', { name: 'Modifier la dépense' })).toBeVisible();
    await pageA.locator('#expense-supplier').fill(updatedSupplier);
    await pageA.getByRole('button', { name: 'Enregistrer les changements' }).click();
    await expect(pageA.getByText(updatedSupplier, { exact: true })).toBeVisible();

    const receiptUpload = await contextA.request.put(`${apiUrl}/expenses/${expense.id}/receipt`, {
      headers: authHeaders(authorizationA, {
        'content-type': 'image/png',
        'x-file-name': encodeURIComponent(receiptName),
      }),
      data: receiptBytes,
    });
    expect(receiptUpload.status(), await receiptUpload.text()).toBe(200);

    const receiptRead = await contextA.request.get(`${apiUrl}/expenses/${expense.id}/receipt`, {
      headers: authHeaders(authorizationA),
    });
    expect(receiptRead.status(), await receiptRead.text()).toBe(200);
    expect(receiptRead.headers()['content-type']).toContain('image/png');
    expect((await receiptRead.body()).length).toBe(receiptBytes.length);

    await pageA.reload();
    await expect(pageA.getByText(receiptName)).toBeVisible();

    await pageA.locator('#expense-supplier-filter').fill(updatedSupplier);
    await expect(pageA.getByText(updatedSupplier, { exact: true })).toBeVisible();
    await expect(pageA.getByText('114,98 $')).toBeVisible();
    await expect(pageA.getByText('14,98 $')).toBeVisible();

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const authorizationB = await signup(pageB, {
      organisation: unique('Organisation-depenses-B'),
      user: 'Administrateur Dépenses B',
      email: `${unique('expenses-admin-b')}@example.com`,
      password,
    });

    const directExpenseB = await contextB.request.get(`${apiUrl}/expenses/${expense.id}`, {
      headers: authHeaders(authorizationB),
    });
    expect([403, 404]).toContain(directExpenseB.status());

    const directReceiptB = await contextB.request.get(`${apiUrl}/expenses/${expense.id}/receipt`, {
      headers: authHeaders(authorizationB),
    });
    expect([403, 404]).toContain(directReceiptB.status());

    await pageB.goto('/expenses');
    await expect(pageB.getByText('Aucune dépense trouvée')).toBeVisible();
    await expect(pageB.getByText(updatedSupplier, { exact: true })).toHaveCount(0);

    const receiptDelete = await contextA.request.delete(`${apiUrl}/expenses/${expense.id}/receipt`, {
      headers: authHeaders(authorizationA),
    });
    expect(receiptDelete.status(), await receiptDelete.text()).toBe(200);

    const expenseDelete = await contextA.request.delete(`${apiUrl}/expenses/${expense.id}`, {
      headers: authHeaders(authorizationA),
    });
    expect(expenseDelete.status(), await expenseDelete.text()).toBe(200);

    const deletedExpense = await contextA.request.get(`${apiUrl}/expenses/${expense.id}`, {
      headers: authHeaders(authorizationA),
    });
    expect(deletedExpense.status()).toBe(404);

    await contextA.close();
    await contextB.close();
  });
});
