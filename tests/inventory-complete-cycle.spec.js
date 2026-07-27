const { test, expect } = require('@playwright/test');

const API_URL = process.env.BACKEND_URL || process.env.API_URL || 'http://localhost:3001';
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('cycle complet d’inventaire', () => {
  test.skip(!email || !password, 'Identifiants E2E absents.');

  test('réceptionne, transfère, sort et valorise un article', async ({ request }) => {
    const login = await request.post(`${API_URL}/api/login`, { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    const loginBody = await login.json();
    const token = loginBody.token || loginBody.accessToken;
    const headers = { Authorization: `Bearer ${token}` };

    const locationsResponse = await request.get(`${API_URL}/api/inventory/locations`, { headers });
    expect(locationsResponse.ok()).toBeTruthy();
    const locations = (await locationsResponse.json()).locations;
    expect(locations.length).toBeGreaterThanOrEqual(2);

    const sku = `E2E-INV-${Date.now()}`;
    const itemResponse = await request.post(`${API_URL}/api/inventory/items`, {
      headers,
      data: { sku, name: 'Article E2E inventaire', unit: 'unité', cost: 12.5, reorderPoint: 2 },
    });
    expect(itemResponse.ok()).toBeTruthy();
    const item = (await itemResponse.json()).item;

    const receipt = await request.post(`${API_URL}/api/inventory/receipts`, {
      headers,
      data: { itemId: item.id, locationId: locations[0].id, quantity: 10, unitCost: 12.5, idempotencyKey: `${sku}-receipt` },
    });
    expect(receipt.ok()).toBeTruthy();

    const transfer = await request.post(`${API_URL}/api/inventory/transfers`, {
      headers,
      data: { itemId: item.id, locationId: locations[0].id, destinationLocationId: locations[1].id, quantity: 4, idempotencyKey: `${sku}-transfer` },
    });
    expect(transfer.ok()).toBeTruthy();

    const issue = await request.post(`${API_URL}/api/inventory/issues`, {
      headers,
      data: { itemId: item.id, locationId: locations[1].id, quantity: 1, idempotencyKey: `${sku}-issue` },
    });
    expect(issue.ok()).toBeTruthy();

    const balancesResponse = await request.get(`${API_URL}/api/inventory/balances?itemId=${item.id}`, { headers });
    expect(balancesResponse.ok()).toBeTruthy();
    const balances = (await balancesResponse.json()).balances;
    const totalQuantity = balances.reduce((sum, balance) => sum + Number(balance.quantity), 0);
    expect(totalQuantity).toBe(9);

    const valuation = await request.get(`${API_URL}/api/inventory/valuation`, { headers });
    expect(valuation.ok()).toBeTruthy();
    expect(Number((await valuation.json()).valuation.inventory_value)).toBeGreaterThan(0);
  });
});
