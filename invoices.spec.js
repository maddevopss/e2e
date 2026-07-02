const { test, expect } = require("@playwright/test");
const { apiLogin } = require("./helpers/auth");

async function createBillableEntry(request, token) {
  const suffix = Date.now();

  const clientRes = await request.post("http://localhost:5000/api/clients", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      nom: `Client Invoice E2E ${suffix}`,
      hourly_rate_defaut: 100,
    },
  });

  expect(clientRes.ok()).toBeTruthy();
  const client = await clientRes.json();

  const projetRes = await request.post("http://localhost:5000/api/projets", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      client_id: client.id,
      nom: `Projet Invoice E2E ${suffix}`,
      taux_horaire: 125,
      status: "actif",
    },
  });

  expect(projetRes.ok()).toBeTruthy();
  const projet = await projetRes.json();

  const start = new Date();
  start.setHours(9, 0, 0, 0);

  const end = new Date(start);
  end.setHours(11, 0, 0, 0);

  const entryRes = await request.post("http://localhost:5000/api/timesheet/manual", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      projet_id: projet.id,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      description: `Travail facturable E2E ${suffix}`,
    },
  });

  expect(entryRes.ok()).toBeTruthy();
  const entry = await entryRes.json();

  return { client, entry };
}

test("creation facture via API visible dans l'UI", async ({ page, request }) => {
  const token = await apiLogin(page, request);
  const { client, entry } = await createBillableEntry(request, token);

  const invoiceRes = await request.post("http://localhost:5000/api/invoices", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      client_id: client.id,
      time_entry_ids: [entry.id],
      tax_rate: 0,
      notes: "Facture E2E",
    },
  });

  expect(invoiceRes.ok()).toBeTruthy();
  const invoice = await invoiceRes.json();

  const listRes = await request.get("http://localhost:5000/api/invoices", {
    headers: { Authorization: `Bearer ${token}` },
  });

  expect(listRes.ok()).toBeTruthy();
  const invoices = await listRes.json();

  expect(invoices.some((row) => row.id === invoice.id)).toBeTruthy();

  await page.getByRole("link", { name: /facturation/i }).click();
  await page.waitForLoadState("networkidle");

  await expect(page.getByText(invoice.invoice_number).first()).toBeVisible({
    timeout: 15000,
  });
});
