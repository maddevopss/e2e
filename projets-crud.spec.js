const { test, expect } = require("@playwright/test");
const { apiLogin } = require("./helpers/auth");

test("création projet via API visible dans l'UI", async ({ page, request }) => {
  const token = await apiLogin(page, request);

  const clientName = `Client Projet ${Date.now()}`;
  const projetName = `Projet E2E ${Date.now()}`;

  const clientRes = await request.post("http://localhost:5000/api/clients", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      nom: clientName,
      hourly_rate_defaut: 100,
    },
  });

  expect(clientRes.ok()).toBeTruthy();
  const client = await clientRes.json();

  const projetRes = await request.post("http://localhost:5000/api/projets", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      client_id: client.id,
      nom: projetName,
      taux_horaire: 100,
      status: "actif",
    },
  });

  expect(projetRes.ok()).toBeTruthy();

  await page.goto("/projets");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText(projetName).first()).toBeVisible({
    timeout: 15000,
  });
});
