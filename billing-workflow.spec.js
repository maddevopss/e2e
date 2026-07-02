const { test, expect } = require("@playwright/test");
const { apiLogin } = require("./helpers/auth");

async function createClient(request, token, suffix) {
  const res = await request.post("http://localhost:5000/api/clients", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      nom: `Client Workflow E2E ${suffix}`,
      hourly_rate_defaut: 100,
    },
  });

  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function createProject(request, token, clientId, suffix) {
  const res = await request.post("http://localhost:5000/api/projets", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      client_id: clientId,
      nom: `Projet Workflow E2E ${suffix}`,
      taux_horaire: 125,
      status: "actif",
    },
  });

  expect(res.ok()).toBeTruthy();
  return res.json();
}

test("workflow complet facturation: client -> projet -> timer -> facture -> PDF", async ({ page, request }) => {
  const token = await apiLogin(page, request);
  const suffix = Date.now();

  const client = await createClient(request, token, suffix);
  const projet = await createProject(request, token, client.id, suffix);

  const startRes = await request.post("http://localhost:5000/api/timer/start", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      projet_id: projet.id,
      description: `Travail timer workflow E2E ${suffix}`,
    },
  });

  expect(startRes.ok()).toBeTruthy();
  const startResponse = await startRes.json();

  expect(startResponse.success).toBe(true);
  expect(startResponse.code).toBe("TIMER_STARTED");
  expect(startResponse.data.id).toBeTruthy();
  expect(new Date(startResponse.timestamp).toISOString()).toBe(startResponse.timestamp);

  const startedEntry = startResponse.data;
  expect(startedEntry.projet_id).toBe(projet.id);

  await page.waitForTimeout(1200);

  const stopRes = await request.patch("http://localhost:5000/api/timer/stop", {
    headers: { Authorization: `Bearer ${token}` },
  });

  expect(stopRes.ok()).toBeTruthy();
  const stopResponse = await stopRes.json();

  expect(stopResponse.success).toBe(true);
  expect(stopResponse.code).toBe("TIMER_STOPPED");
  expect(new Date(stopResponse.timestamp).toISOString()).toBe(stopResponse.timestamp);

  const stoppedEntry = stopResponse.data;
  expect(stoppedEntry.id).toBe(startedEntry.id);
  expect(stoppedEntry.end_time).toBeTruthy();

  const unbilledRes = await request.get(`http://localhost:5000/api/invoices/unbilled-entries?client_id=${client.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  expect(unbilledRes.ok()).toBeTruthy();
  const unbilledEntries = await unbilledRes.json();
  expect(unbilledEntries.some((entry) => entry.id === stoppedEntry.id)).toBeTruthy();

  const invoiceRes = await request.post("http://localhost:5000/api/invoices", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      client_id: client.id,
      time_entry_ids: [stoppedEntry.id],
      tax_rate: 0,
      notes: "Facture workflow E2E",
    },
  });

  expect(invoiceRes.ok()).toBeTruthy();
  const invoice = await invoiceRes.json();
  expect(invoice.id).toBeTruthy();
  expect(invoice.invoice_number).toBeTruthy();

  const pdfRes = await request.get(`http://localhost:5000/api/invoices/${invoice.id}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  expect(pdfRes.ok()).toBeTruthy();
  expect(pdfRes.headers()["content-type"]).toContain("application/pdf");

  const pdfBuffer = await pdfRes.body();
  expect(pdfBuffer.length).toBeGreaterThan(500);
  expect(pdfBuffer.slice(0, 4).toString()).toBe("%PDF");

  await page.getByRole("link", { name: /facturation/i }).click();
  await page.waitForLoadState("networkidle");

  await expect(page.getByText(invoice.invoice_number).first()).toBeVisible({ timeout: 15000 });
});
