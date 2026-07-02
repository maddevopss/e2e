const { test, expect } = require("@playwright/test");
const { login } = require("./helpers/auth");

test("Admin can change retention settings", async ({ page }) => {
  // 1. Connexion
  await login(page);

  // 2. Navigation vers les réglages (supposons la route /settings/organisation)
  await page.goto("/settings/organisation");

  // 3. Modification d'une valeur
  const input = page.locator('input[name="retention_activity_logs_days"]');
  await input.clear();
  await input.fill("45");

  // 4. Sauvegarde
  await page.click('button:has-text("Sauvegarder")');

  // 5. Vérification du toast de succès
  await expect(page.locator("text=Paramètres de rétention mis à jour")).toBeVisible();

  // 6. Rafraîchir et vérifier que la valeur est restée à 45
  await page.reload();
  await expect(input).toHaveValue("45");
});
