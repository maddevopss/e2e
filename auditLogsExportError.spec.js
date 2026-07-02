const { test, expect } = require("@playwright/test");
const { login } = require("./helpers/auth");

test.describe("Audit Logs - Export Error Handling", () => {
  test("should show error toast and re-enable button when server returns 500", async ({ page }) => {
    // 1. Connexion
    await login(page);

    // 2. Navigation vers les logs d'audit
    await page.goto("/settings/audit-logs");
    await page.waitForSelector("text=Journal d'audit");

    // 3. Intercepter l'appel d'export et simuler une erreur 500
    await page.route("**/api/organisation/audit-logs/export*", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "Internal Server Error" }),
      });
    });

    // 4. Cliquer sur le bouton d'export
    const exportButton = page.locator('button:has-text("Exporter CSV")');
    await exportButton.click();

    // 5. Vérifier que le toast d'erreur apparaît
    await expect(page.locator("text=Erreur lors de l'export CSV")).toBeVisible();

    // 6. Vérifier que le bouton est de nouveau actif (le chargement est fini)
    await expect(exportButton).toBeEnabled();
    await expect(exportButton).toHaveText("Exporter CSV");
  });
});
