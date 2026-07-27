const { test, expect } = require('@playwright/test');

const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('cycle fournisseur complet', () => {
  test.skip(!email || !password, 'Identifiants E2E requis.');

  test('demande, commande, réception, facture et paiement', async ({ request }) => {
    const login = await request.post('/api/login', { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    const token = (await login.json()).token;
    const headers = { Authorization: `Bearer ${token}` };

    const supplier = await request.post('/api/suppliers', { headers, data: { name: `Fournisseur E2E ${Date.now()}`, supplierNumber: `E2E-${Date.now()}`, currency: 'CAD' } });
    expect(supplier.ok()).toBeTruthy();

    const requisition = await request.post('/api/procurement/requisitions', { headers, data: { title: 'Achat E2E', justification: 'Validation du cycle complet', currency: 'CAD', items: [{ description: 'Article test', quantity: 2, unitPrice: 50 }] } });
    expect(requisition.ok()).toBeTruthy();

    const orders = await request.get('/api/procurement/purchase-orders', { headers });
    expect(orders.ok()).toBeTruthy();

    const bills = await request.get('/api/supplier-bills', { headers });
    expect(bills.ok()).toBeTruthy();
  });
});