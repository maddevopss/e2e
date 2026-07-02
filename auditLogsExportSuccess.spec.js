const { test, expect } = require("@playwright/test");
const fs = require("fs");
const { login, TEST_EMAIL } = require("./helpers/auth");

test.describe("Audit Logs - Export Success", () => {
  test("should download a CSV and contain triggered audit actions", async ({ page }) => {
    // 1. Connexion
    await login(page);

    // 2. Navigation vers les logs d'audit
    await page.goto("/settings/audit-logs");
    await page.waitForSelector("text=Journal d'audit");

    // 3. Préparer l'interception du téléchargement
    // On utilise Promise.all pour éviter les conditions de course (race conditions)
    const [download] = await Promise.all([
      page.waitForEvent("download"), // Attend l'événement de téléchargement
      page.click('button:has-text("Exporter CSV")'), // Déclenche le clic
    ]);

    // 4. Vérifications sur le fichier
    const fileName = download.suggestedFilename();
    expect(fileName).toMatch(/^audit_logs_\d{4}-\d{2}-\d{2}\.csv$/);

    // 6. Lecture du contenu du fichier
    const filePath = await download.path(); // Récupère le chemin temporaire
    const content = fs.readFileSync(filePath, "utf8");

    // 7. Validation des données
    const lines = content.split("\n");

    // Vérification des headers
    expect(lines[0]).toContain("Date,Utilisateur,Action,Details");

    // Vérification de la présence de notre action générée
    const logEntry = lines.find((line) => line.includes("UPDATE_RETENTION_POLICY"));
    expect(logEntry).toBeDefined();
    expect(logEntry).toContain(uniqueValue.toString());
    expect(logEntry).toContain(TEST_EMAIL);
  });
});
