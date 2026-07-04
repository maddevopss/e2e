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
const TEST_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.TEST_USER_EMAIL;
const TEST_PASSWORD = process.env.E2E_PASSWORD || process.env.TEST_USER_PASSWORD;
const TEST_API_URL = process.env.TEST_API_URL || "http://127.0.0.1:5000";

if (!TEST_EMAIL || !TEST_PASSWORD) {
  throw new Error("E2E_ADMIN_EMAIL and E2E_PASSWORD are required. Check backend/.env.test");
}

test("authenticate and save storage state", async ({ page, context, request }) => {
  // Faire un vrai login UI pour hydrater le navigateur correctement
  // Le frontend utilise tokenStore.js (mémoire-only) + authContext.jsx
  // Seul un vrai login UI peut hydrater correctement le navigateur
  
  console.log(`🔐 Attempting UI login with email: ${TEST_EMAIL}`);
  
  // Naviguer vers la page de login
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  
  // Remplir le formulaire de login
  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  
  // Soumettre le formulaire
  await page.click('button[type="submit"]');
  
  // Attendre la redirection vers le dashboard
  // Le frontend redirige automatiquement après un login réussi
  await page.waitForURL(/dashboard/, { timeout: 15000 });
  
  const finalUrl = page.url();
  console.log("📍 Final URL after UI login:", finalUrl);
  
  if (finalUrl.includes("/login")) {
    throw new Error("Auth setup failed: still on login after UI login attempt");
  }
  
  // Attendre que le dashboard soit complètement chargé
  await page.waitForLoadState("networkidle");
  
  // Sauvegarder l'état de stockage (cookies, localStorage, sessionStorage)
  // Chemin absolu pour éviter les problèmes de répertoire de travail
  const authPath = path.resolve(process.cwd(), "auth.json");

  console.log("💾 Saving auth state to:", authPath);

  await context.storageState({ path: authPath });

  console.log("✅ Auth state saved successfully");
});
