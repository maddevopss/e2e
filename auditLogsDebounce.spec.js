const { test, expect } = require("@playwright/test");
const { login } = require("./helpers/auth");

test.describe("Audit Logs - Debounce Filter", () => {
  test("should only trigger one API call when typing rapidly", async ({ page }) => {
    await login(page);
    await page.goto("/settings/audit-logs");
    await page.waitForSelector("text=Journal d'audit");

    let requestCount = 0;
    const requests = [];

    const handler = (req) => {
      if (req.url().includes("/api/organisation/audit-logs")) {
        requestCount++;
        requests.push(req.url());
      }
    };
    page.on("request", handler);

    const emailInput = page.locator('input[placeholder="Filtrer par email..."]');
    await emailInput.focus();

    // ✅ Taper lettre par lettre (simule l'utilisateur réel)
    for (const char of "admin") {
      await page.keyboard.press(char);
      await page.waitForTimeout(100); // Délai entre les caractères
    }

    // Aucun appel API pendant la frappe (debounce active)
    expect(requestCount).toBe(0);

    // Attendre le debounce (500ms + marge)
    await page.waitForFunction(() => requestCount >= 1, { timeout: 2000 });

    // Vérifier qu'un seul appel a été fait
    expect(requestCount).toBe(1);
    expect(requests[0]).toContain("admin");

    page.removeListener("request", handler);
  });
});
