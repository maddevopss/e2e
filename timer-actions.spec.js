const { test, expect } = require("@playwright/test");

const { apiLogin } = require("./helpers/auth");

test("démarrer et arrêter timer", async ({ page, request }) => {
  const token = await apiLogin(page, request);
  const authHeaders = {
    Authorization: `Bearer ${token}`,
  };

  const suffix = Date.now();
  const clientName = `Client Timer E2E ${suffix}`;
  const projetName = `Projet Timer E2E ${suffix}`;

  const clientRes = await request.post("http://localhost:5000/api/clients", {
    headers: authHeaders,
    data: {
      nom: clientName,
      email: `timer-${suffix}@test.com`,
      telephone: "514-000-0000",
      adresse: "123 Rue Timer",
      hourly_rate_defaut: 95,
    },
  });

  if (!clientRes.ok()) {
    console.log("CREATE CLIENT STATUS:", clientRes.status());
    console.log("CREATE CLIENT BODY:", await clientRes.text());
  }

  expect(clientRes.ok()).toBeTruthy();

  const clientData = await clientRes.json();
  const clientId = clientData.id || clientData.client?.id || clientData.data?.id;

  expect(clientId).toBeTruthy();

  const projetRes = await request.post("http://localhost:5000/api/projets", {
    headers: authHeaders,
    data: {
      nom: projetName,
      client_id: clientId,
      taux_horaire: 95,
      actif: true,
    },
  });

  expect(projetRes.ok()).toBeTruthy();

  const projetData = await projetRes.json();
  const projetId = projetData.id || projetData.projet?.id || projetData.data?.id;

  expect(projetId).toBeTruthy();

  const startRes = await request.post("http://localhost:5000/api/timer/start", {
    headers: authHeaders,
    data: {
      projet_id: projetId,
      description: "Timer E2E start",
    },
  });

  expect(startRes.ok()).toBeTruthy();
  const startResponse = await startRes.json();

  expect(startResponse.success).toBe(true);
  expect(startResponse.code).toBe("TIMER_STARTED");
  expect(startResponse.data.id).toBeTruthy();
  expect(new Date(startResponse.timestamp).toISOString()).toBe(startResponse.timestamp);
  expect(Number(startResponse.data.projet_id)).toBe(Number(projetId));

  const activeRes = await request.get("http://localhost:5000/api/timer/active", {
    headers: authHeaders,
  });

  expect(activeRes.ok()).toBeTruthy();

  const activeResponse = await activeRes.json();

  expect(activeResponse.success).toBe(true);
  expect(activeResponse.code).toBe("TIMER_ACTIVE");
  expect(activeResponse.data).toBeTruthy();
  expect(new Date(activeResponse.timestamp).toISOString()).toBe(activeResponse.timestamp);
  expect(Number(activeResponse.data.projet_id)).toBe(Number(projetId));

  await page.goto("/dashboard");

  await expect(page).toHaveURL(/dashboard/i);

  const stopRes = await request.patch("http://localhost:5000/api/timer/stop", {
    headers: authHeaders,
    data: {
      note: "Timer E2E stop",
    },
  });

  expect(stopRes.ok()).toBeTruthy();
  const stopResponse = await stopRes.json();

  expect(stopResponse.success).toBe(true);
  expect(stopResponse.code).toBe("TIMER_STOPPED");
  expect(stopResponse.data.id).toBe(startResponse.data.id);
  expect(stopResponse.data.end_time).toBeTruthy();
  expect(new Date(stopResponse.timestamp).toISOString()).toBe(stopResponse.timestamp);

  const activeAfterStopRes = await request.get("http://localhost:5000/api/timer/active", {
    headers: authHeaders,
  });

  expect(activeAfterStopRes.ok()).toBeTruthy();

  const activeAfterStopResponse = await activeAfterStopRes.json();

  expect(activeAfterStopResponse.success).toBe(true);
  expect(activeAfterStopResponse.code).toBe("NO_ACTIVE_TIMER");
  expect(activeAfterStopResponse.data).toBeNull();
  expect(new Date(activeAfterStopResponse.timestamp).toISOString()).toBe(activeAfterStopResponse.timestamp);
});
