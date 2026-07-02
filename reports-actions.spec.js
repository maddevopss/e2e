const { test, expect } = require("@playwright/test");
const { apiLogin, getToken } = require("./helpers/auth");

test("rapport affiche une entrée facturable", async ({ page, request }) => {
  await apiLogin(page, request);

  const token = await getToken(page);

  const clientName = `Client Report ${Date.now()}`;
  const projetName = `Projet Report ${Date.now()}`;

  const clientRes = await request.post("http://localhost:5000/api/clients", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data: {
      nom: clientName,
      hourly_rate_defaut: 100,
    },
  });

  expect(clientRes.ok()).toBeTruthy();
  const client = await clientRes.json();

  const projetRes = await request.post("http://localhost:5000/api/projets", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data: {
      client_id: client.id,
      nom: projetName,
      taux_horaire: 100,
      status: "actif",
    },
  });

  expect(projetRes.ok()).toBeTruthy();
  const projet = await projetRes.json();

  const now = new Date();
  const start = new Date(now);
  start.setHours(9, 0, 0, 0);

  const end = new Date(now);
  end.setHours(10, 0, 0, 0);

  const entryRes = await request.post("http://localhost:5000/api/timesheet/manual", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data: {
      projet_id: projet.id,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      description: "Entrée rapport Playwright",
    },
  });

  expect(entryRes.ok()).toBeTruthy();

  await page.goto("/reports");

  await expect(page.getByText(/rapport/i).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: new RegExp(clientName, "i") })).toBeVisible({
    timeout: 10000,
  });

  await expect(page.getByRole("cell", { name: new RegExp(projetName, "i") })).toBeVisible({
    timeout: 10000,
  });
});

test("rapport contient les actions export", async ({ page, request }) => {
  await apiLogin(page, request);

  await page.goto("/reports");

  await expect(page.getByRole("button", { name: /csv|excel|export/i }).first()).toBeVisible();

  await expect(page.getByRole("button", { name: /pdf|export/i }).first()).toBeVisible();
});
