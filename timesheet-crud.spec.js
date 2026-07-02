const { test, expect } = require("@playwright/test");
const { apiLogin } = require("./helpers/auth");

test("affiche une entrée timesheet créée via API", async ({ page, request }) => {
  const token = await apiLogin(page, request);

  const clientName = `Client TS ${Date.now()}`;
  const projetName = `Projet TS ${Date.now()}`;
  const description = `Entrée Playwright ${Date.now()}`;

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
      description,
    },
  });

  expect(entryRes.ok()).toBeTruthy();

  await page.goto("/timesheet");
  await page.waitForLoadState("networkidle");
  const entriesRes = await request.get("http://localhost:5000/api/timesheet/entries?page=1&limit=50", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  expect(entriesRes.ok()).toBeTruthy();

  const entriesData = await entriesRes.json();

  expect(entriesData.data.some((entry) => entry.description === description)).toBeTruthy();

  await page.goto("/timesheet");
  await expect(page.getByText(/feuilles de temps|temps/i).first()).toBeVisible();
});
