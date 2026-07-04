const { test, expect } = require("@playwright/test");
const { apiLogin } = require("./helpers/auth");
const {
  createClient,
  createProject,
  createTimeEntry,
  createInvoice,
} = require("./helpers/api");

/**
 * BLOC 18 — E2E Revenue Core Validation
 * 
 * Valide le flow complet P0 Revenue Core :
 * signup → onboarding → dashboard guidé → premier client → premier projet → temps → première facture → modal upgrade
 * 
 * Scénarios :
 * 1. Nouveau compte guidé vers première action
 * 2. Premier client vers projet
 * 3. Projet vers temps
 * 4. Temps vers première facture
 * 5. Modal première facture
 * 6. Modal non répétée
 * 7. CTA Pro
 */

test.describe("Revenue Core — P0 Flow", () => {
  
  // ═══════════════════════════════════════════════════════════════
  // Test 1 : Nouveau compte guidé vers première action
  // ═══════════════════════════════════════════════════════════════
  test("Test 1 — Dashboard affiche guide pour compte vide", async ({ page, request }) => {
    // Naviguer vers dashboard
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    
    // Debug: Log URL et contenu
    console.log("📍 Dashboard URL:", page.url());
    const bodyText = await page.locator("body").innerText();
    console.log("📄 Dashboard body text (first 500 chars):", bodyText.substring(0, 500));
    
    // Prendre une screenshot pour debug
    await page.screenshot({ path: "test-results/debug-dashboard-test1.png", fullPage: true });
    
    // Vérifier que le guide "Commencez en 3 étapes" est visible via data-testid
    const guide = page.getByTestId("guided-dashboard");
    await expect(guide).toBeVisible({ timeout: 10000 });
    
    // Vérifier que le CTA "Créer votre premier client" est visible
    const cta = page.getByTestId("create-first-client-cta");
    await expect(cta).toBeVisible();
    
    // Clic sur le CTA
    await cta.click();
    
    // Vérifier redirection vers /clients
    await expect(page).toHaveURL(/clients/i);
  });

  // ═══════════════════════════════════════════════════════════════
  // Test 2 : Premier client vers projet
  // ═══════════════════════════════════════════════════════════════
   test("Test 2 — Création premier client et redirection", async ({ page, request }) => {
     await apiLogin(page, request);
     
     // Naviguer vers clients
     await page.goto("/clients");
     await page.waitForLoadState("networkidle");
     
     // Créer un client
     const clientName = `Client P0 ${Date.now()}`;
     
     // Chercher le bouton "Créer votre premier client" ou "Ajouter"
     const addBtn = page.getByTestId("add-client-button");
     await addBtn.click();
    
    // Remplir le formulaire modal
    const modal = page.locator(".ui-modal, .modal, [role='dialog']").first();
    await modal.locator("input").first().fill(clientName);
    
    // Sauvegarder
    const saveBtn = modal.getByRole("button", { name: /Sauvegarder|Enregistrer|Créer/i });
    await saveBtn.click();
    
    // Vérifier que le client est créé
    await expect(page.getByText(clientName)).toBeVisible({ timeout: 10000 });
  });

  // ═══════════════════════════════════════════════════════════════
  // Test 3 : Projet vers temps
  // ═══════════════════════════════════════════════════════════════
  test("Test 3 — Création premier projet et ajout temps", async ({ page, request }) => {
    const token = await apiLogin(page, request);
    
    // Créer un client via API
    const suffix = Date.now();
    const client = await createClient(request, token, {
      nom: `Client P0 Test ${suffix}`,
      hourly_rate_defaut: 100,
    });
    
    // Naviguer vers projets
    await page.goto("/projets");
    await page.waitForLoadState("networkidle");
    
    // Créer un projet
    const projectName = `Projet P0 ${suffix}`;
    const addBtn = page.getByTestId("add-project-button");
    await addBtn.click();
    
    const modal = page.locator(".ui-modal, .modal, [role='dialog']").first();
    
    // Sélectionner le client
    const clientSelect = modal.locator("select, [role='combobox']").first();
    if (await clientSelect.count() > 0) {
      await clientSelect.click();
      await page.locator(`text=${client.nom}`).click();
    }
    
    // Remplir le nom du projet
    const inputs = modal.locator("input");
    const projectInput = inputs.filter({ hasText: /nom|project/i }).first();
    if (await projectInput.count() > 0) {
      await projectInput.fill(projectName);
    } else {
      await inputs.nth(0).fill(projectName);
    }
    
    // Sauvegarder
    const saveBtn = modal.getByRole("button", { name: /Sauvegarder|Enregistrer|Créer/i });
    await saveBtn.click();
    
    // Vérifier que le projet est créé
    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10000 });
  });

  // ═══════════════════════════════════════════════════════════════
  // Test 4 : Temps vers première facture
  // ═══════════════════════════════════════════════════════════════
  test("Test 4 — Création première facture", async ({ page, request }) => {
    const token = await apiLogin(page, request);
    
    // Créer client, projet, et entrée de temps via API
    const suffix = Date.now();
    
    const client = await createClient(request, token, {
      nom: `Client Invoice P0 ${suffix}`,
      hourly_rate_defaut: 100,
    });
    
    const projet = await createProject(request, token, {
      client_id: client.id,
      nom: `Projet Invoice P0 ${suffix}`,
      taux_horaire: 125,
      status: "actif",
    });
    
    const start = new Date();
    start.setHours(9, 0, 0, 0);
    const end = new Date(start);
    end.setHours(11, 0, 0, 0);
    
    const entry = await createTimeEntry(request, token, {
      projet_id: projet.id,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      description: `Travail P0 ${suffix}`,
    });
    
    // Naviguer vers factures
    await page.goto("/invoices");
    await page.waitForLoadState("networkidle");
    
    // Créer une facture
    const createBtn = page.getByTestId("create-invoice-button");
    await createBtn.click();
    
    const modal = page.locator(".ui-modal, .modal, [role='dialog']").first();
    
    // Sélectionner le client
    const clientSelect = modal.locator("select, [role='combobox']").first();
    if (await clientSelect.count() > 0) {
      await clientSelect.click();
      await page.locator(`text=${client.nom}`).click();
    }
    
    // Sélectionner l'entrée de temps
    const timeCheckbox = modal.locator(`text=${entry.description}`).locator("..").locator("input[type='checkbox']");
    if (await timeCheckbox.count() > 0) {
      await timeCheckbox.check();
    }
    
    // Créer la facture
    const saveBtn = modal.getByRole("button", { name: /Créer|Sauvegarder/i });
    await saveBtn.click();
    
    // Vérifier que la facture est créée
    await expect(page.locator("text=/Facture|Invoice/i")).toBeVisible({ timeout: 10000 });
  });

  // ═══════════════════════════════════════════════════════════════
  // Test 5 : Modal première facture
  // ═══════════════════════════════════════════════════════════════
  test("Test 5 — Modal première facture s'affiche", async ({ page, request }) => {
    const token = await apiLogin(page, request);
    
    // Créer client, projet, temps via API
    const suffix = Date.now();
    
    const client = await createClient(request, token, {
      nom: `Client Modal P0 ${suffix}`,
      hourly_rate_defaut: 100,
    });
    
    const projet = await createProject(request, token, {
      client_id: client.id,
      nom: `Projet Modal P0 ${suffix}`,
      taux_horaire: 125,
      status: "actif",
    });
    
    const start = new Date();
    start.setHours(9, 0, 0, 0);
    const end = new Date(start);
    end.setHours(11, 0, 0, 0);
    
    const entry = await createTimeEntry(request, token, {
      projet_id: projet.id,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      description: `Travail Modal P0 ${suffix}`,
    });
    
    // Créer la facture via API
    await createInvoice(request, token, {
      client_id: client.id,
      time_entry_ids: [entry.id],
      tax_rate: 0,
    });
    
    // Naviguer vers factures
    await page.goto("/invoices");
    await page.waitForLoadState("networkidle");
    
    // Vérifier que la modal première facture s'affiche
    const modal = page.locator("text=Bravo, votre première facture est créée");
    await expect(modal).toBeVisible({ timeout: 10000 });
    
    // Vérifier les boutons
    const proBtn = page.getByRole("button", { name: /Passer au Pro/i });
    const invoiceBtn = page.getByRole("button", { name: /Voir ma facture/i });
    const laterBtn = page.getByRole("button", { name: /Plus tard/i });
    
    await expect(proBtn).toBeVisible();
    await expect(invoiceBtn).toBeVisible();
    await expect(laterBtn).toBeVisible();
  });

  // ═══════════════════════════════════════════════════════════════
  // Test 6 : Modal non répétée
  // ═══════════════════════════════════════════════════════════════
  test("Test 6 — Modal première facture ne s'affiche qu'une fois", async ({ page, request }) => {
    const token = await apiLogin(page, request);
    
    // Créer 2 factures
    const suffix = Date.now();
    
    const client = await createClient(request, token, {
      nom: `Client Repeat P0 ${suffix}`,
      hourly_rate_defaut: 100,
    });
    
    const projet = await createProject(request, token, {
      client_id: client.id,
      nom: `Projet Repeat P0 ${suffix}`,
      taux_horaire: 125,
      status: "actif",
    });
    
    // Créer 2 entrées de temps
    const start1 = new Date();
    start1.setHours(9, 0, 0, 0);
    const end1 = new Date(start1);
    end1.setHours(11, 0, 0, 0);
    
    const entry1 = await createTimeEntry(request, token, {
      projet_id: projet.id,
      start_time: start1.toISOString(),
      end_time: end1.toISOString(),
      description: `Travail 1 P0 ${suffix}`,
    });
    
    const start2 = new Date();
    start2.setHours(14, 0, 0, 0);
    const end2 = new Date(start2);
    end2.setHours(16, 0, 0, 0);
    
    const entry2 = await createTimeEntry(request, token, {
      projet_id: projet.id,
      start_time: start2.toISOString(),
      end_time: end2.toISOString(),
      description: `Travail 2 P0 ${suffix}`,
    });
    
    // Créer première facture
    await createInvoice(request, token, {
      client_id: client.id,
      time_entry_ids: [entry1.id],
      tax_rate: 0,
    });
    
    // Naviguer vers factures
    await page.goto("/invoices");
    await page.waitForLoadState("networkidle");
    
    // Vérifier que la modal s'affiche
    const modal = page.locator("text=Bravo, votre première facture est créée");
    await expect(modal).toBeVisible({ timeout: 10000 });
    
    // Fermer la modal
    const laterBtn = page.getByRole("button", { name: /Plus tard/i });
    await laterBtn.click();
    
    // Créer deuxième facture
    await createInvoice(request, token, {
      client_id: client.id,
      time_entry_ids: [entry2.id],
      tax_rate: 0,
    });
    
    // Recharger la page
    await page.reload();
    await page.waitForLoadState("networkidle");
    
    // Vérifier que la modal ne s'affiche pas à nouveau
    const modalAgain = page.locator("text=Bravo, votre première facture est créée");
    await expect(modalAgain).not.toBeVisible({ timeout: 5000 });
  });

  // ═══════════════════════════════════════════════════════════════
  // Test 7 : CTA Pro
  // ═══════════════════════════════════════════════════════════════
  test("Test 7 — CTA Passer au Pro redirige correctement", async ({ page, request }) => {
    const token = await apiLogin(page, request);
    
    // Créer une facture
    const suffix = Date.now();
    
    const client = await createClient(request, token, {
      nom: `Client Pro P0 ${suffix}`,
      hourly_rate_defaut: 100,
    });
    
    const projet = await createProject(request, token, {
      client_id: client.id,
      nom: `Projet Pro P0 ${suffix}`,
      taux_horaire: 125,
      status: "actif",
    });
    
    const start = new Date();
    start.setHours(9, 0, 0, 0);
    const end = new Date(start);
    end.setHours(11, 0, 0, 0);
    
    const entry = await createTimeEntry(request, token, {
      projet_id: projet.id,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      description: `Travail Pro P0 ${suffix}`,
    });
    
    await createInvoice(request, token, {
      client_id: client.id,
      time_entry_ids: [entry.id],
      tax_rate: 0,
    });
    
    // Naviguer vers factures
    await page.goto("/invoices");
    await page.waitForLoadState("networkidle");
    
    // Vérifier que la modal s'affiche
    const modal = page.locator("text=Bravo, votre première facture est créée");
    await expect(modal).toBeVisible({ timeout: 10000 });
    
    // Clic sur "Passer au Pro"
    const proBtn = page.getByRole("button", { name: /Passer au Pro/i });
    await proBtn.click();
    
    // Vérifier redirection vers /modules-and-subscription
    await expect(page).toHaveURL(/modules-and-subscription|subscription/i, { timeout: 10000 });
  });
});
