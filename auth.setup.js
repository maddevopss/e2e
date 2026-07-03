const { test, expect } = require("@playwright/test");
const path = require("path");
const dotenv = require("dotenv");

/**
 * Auth Setup Project
 * 
 * Génère auth.json avec les cookies de session authentifiée.
 * Exécuté une seule fois avant tous les tests.
 * 
 * Utilisé par :
 * - responsive-mobile.spec.js
 * - responsive-screenshots.spec.js
 * - Tous les autres tests E2E
 */

// Charger backend/.env.test pour avoir les bonnes credentials E2E
dotenv.config({
  path: path.resolve(__dirname, "../backend/.env.test"),
  override: false,
});

// Priorité: E2E_ADMIN_EMAIL > TEST_USER_EMAIL > fallback
// (doit correspondre à seedE2EUsers dans setupInvoicesTestDB.js)
const TEST_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.TEST_USER_EMAIL || "admin@test.com";
const TEST_PASSWORD = process.env.E2E_PASSWORD || process.env.TEST_USER_PASSWORD || "1234";
const TEST_API_URL = process.env.TEST_API_URL || "http://127.0.0.1:5000";

test("authenticate and save storage state", async ({ page, context, request }) => {
  // Authentifier via l'API directement
  // Route: POST /api/login (montée sur /api par app.js)
  console.log(`🔐 Attempting login with email: ${TEST_EMAIL}`);
  
  const loginResponse = await request.post(TEST_API_URL + "/api/login", {
    data: {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    },
  });

  if (!loginResponse.ok()) {
    const errorText = await loginResponse.text();
    throw new Error(`Login failed: ${loginResponse.status()} ${loginResponse.statusText()} - ${errorText}`);
  }

  const loginData = await loginResponse.json();
  console.log("✅ Login successful via API");
  console.log("📦 Response:", loginData);

  // Extraire les cookies de la réponse
  const setCookieHeader = loginResponse.headers()["set-cookie"];
  if (setCookieHeader) {
    console.log("🍪 Cookies received from API");
  }

  // Naviguer vers le dashboard pour capturer l'état de stockage
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");

  // Sauvegarder l'état de stockage (cookies, localStorage, sessionStorage)
  // Chemin absolu pour éviter les problèmes de répertoire de travail
  const authPath = path.resolve(process.cwd(), "auth.json");

  console.log("💾 Saving auth state to:", authPath);

  await context.storageState({ path: authPath });

  console.log("✅ Auth state saved successfully");
});
