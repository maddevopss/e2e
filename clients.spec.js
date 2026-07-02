const { test, expect } = require("@playwright/test");
const { apiLogin } = require("./helpers/auth");

test("navigation clients", async ({ page, request }) => {
  await apiLogin(page, request);

  await page.getByRole("link", { name: /^Client$/i }).click();

  await expect(page).toHaveURL(/clients?/i);
});

test("création client", async ({ page, request }) => {
  await apiLogin(page, request);

  await page.getByRole("link", { name: /^Client$/i }).click();

  await page
    .locator("button")
    .filter({ hasText: /^Ajouter$/i })
    .click();

  const modal = page.locator(".ui-modal, .modal, [role='dialog']").first();

  const clientName = `Client E2E ${Date.now()}`;

  await modal.locator("input").first().fill(clientName);

  const numberInput = modal.locator('input[type="number"]').first();

  if ((await numberInput.count()) > 0) {
    await numberInput.fill("100");
  }

  await modal
    .getByRole("button", {
      name: /sauvegarder|enregistrer|ajouter|créer/i,
    })
    .click();

  await expect(page.getByText(clientName)).toBeVisible({
    timeout: 10000,
  });
});
