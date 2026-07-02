const { test, expect } = require("@playwright/test");
const pool = require("../backend/db");
const { apiLogin } = require("./helpers/auth");
const { createTestOrganisation, createTestClient } = require("../backend/src/test/helpers/testData");

test.afterAll(async () => {
  await pool.end();
});

test("les clients d'une autre organisation ne sont pas visibles via API ni UI", async ({ page, request }) => {
  const token = await apiLogin(page, request);
  const suffix = Date.now();

  const ownClientRes = await request.post("http://localhost:5000/api/clients", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      nom: `Client Org Courante ${suffix}`,
      hourly_rate_defaut: 100,
    },
  });

  expect(ownClientRes.ok()).toBeTruthy();

  const otherOrganisation = await createTestOrganisation({
    nom: `Organisation Isolee E2E ${suffix}`,
  });
  const otherClient = await createTestClient({
    nom: `Client Autre Org ${suffix}`,
    organisation_id: otherOrganisation.id,
    hourly_rate_defaut: 100,
  });

  const clientsRes = await request.get("http://localhost:5000/api/clients", {
    headers: { Authorization: `Bearer ${token}` },
  });

  expect(clientsRes.ok()).toBeTruthy();
  const clients = await clientsRes.json();

  expect(clients.some((client) => client.id === otherClient.id)).toBeFalsy();
  expect(clients.some((client) => client.nom === otherClient.nom)).toBeFalsy();

  await page.goto("/clients");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText(otherClient.nom)).not.toBeVisible();
});
