const { test } = require("@playwright/test");
const { login } = require("./helpers/auth");
const path = require("path");

/**
 * Phase 6 — Responsive Visual Evidence
 * 
 * Captures visuelles ciblées pour diagnostic des régressions responsive.
 * Exécuté en nightly seulement, non-bloquant.
 * 
 * Screenshots couverts :
 * - Dashboard @390px (mobile)
 * - Dashboard @1440px (desktop)
 * - Invoices @390px (mobile)
 * - Timesheet @390px (mobile)
 * - Settings @390px (mobile)
 */

// Breakpoints critiques pour screenshots
const SCREENSHOT_BREAKPOINTS = {
  mobile: { width: 390, height: 844, name: "390px-mobile" },
  desktop: { width: 1440, height: 900, name: "1440px-desktop" },
};

// Pages critiques à capturer
const CRITICAL_PAGES = [
  { path: "/dashboard", name: "Dashboard" },
  { path: "/invoices", name: "Invoices" },
  { path: "/timesheet", name: "Timesheet" },
  { path: "/settings", name: "Settings" },
];

test.describe("Responsive Visual Evidence — Screenshots", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // ═══════════════════════════════════════════════════════════════
  // DASHBOARD SCREENSHOTS
  // ═══════════════════════════════════════════════════════════════

  test("Dashboard @390px - Screenshot", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.setViewportSize(SCREENSHOT_BREAKPOINTS.mobile);
    await page.waitForTimeout(500); // Attendre le reflow

    await page.screenshot({
      path: path.join("test-results", "screenshots", "dashboard-390px-mobile.png"),
      fullPage: true,
    });
  });

  test("Dashboard @1440px - Screenshot", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.setViewportSize(SCREENSHOT_BREAKPOINTS.desktop);
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join("test-results", "screenshots", "dashboard-1440px-desktop.png"),
      fullPage: true,
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // INVOICES SCREENSHOTS
  // ═══════════════════════════════════════════════════════════════

  test("Invoices @390px - Screenshot", async ({ page }) => {
    await page.goto("/invoices");
    await page.waitForLoadState("networkidle");
    await page.setViewportSize(SCREENSHOT_BREAKPOINTS.mobile);
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join("test-results", "screenshots", "invoices-390px-mobile.png"),
      fullPage: true,
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TIMESHEET SCREENSHOTS
  // ═══════════════════════════════════════════════════════════════

  test("Timesheet @390px - Screenshot", async ({ page }) => {
    await page.goto("/timesheet");
    await page.waitForLoadState("networkidle");
    await page.setViewportSize(SCREENSHOT_BREAKPOINTS.mobile);
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join("test-results", "screenshots", "timesheet-390px-mobile.png"),
      fullPage: true,
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SETTINGS SCREENSHOTS
  // ═══════════════════════════════════════════════════════════════

  test("Settings @390px - Screenshot", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    await page.setViewportSize(SCREENSHOT_BREAKPOINTS.mobile);
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join("test-results", "screenshots", "settings-390px-mobile.png"),
      fullPage: true,
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // HEADER & NAVIGATION SCREENSHOTS
  // ═══════════════════════════════════════════════════════════════

  test("Header @390px - Screenshot", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.setViewportSize(SCREENSHOT_BREAKPOINTS.mobile);
    await page.waitForTimeout(500);

    // Capturer juste le header
    const header = page.locator(".header");
    if (await header.count() > 0) {
      await header.screenshot({
        path: path.join("test-results", "screenshots", "header-390px-mobile.png"),
      });
    }
  });

  test("Sidebar visibility @390px - Screenshot", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.setViewportSize(SCREENSHOT_BREAKPOINTS.mobile);
    await page.waitForTimeout(500);

    // Capturer la zone de navigation
    const main = page.locator(".main");
    if (await main.count() > 0) {
      await main.screenshot({
        path: path.join("test-results", "screenshots", "main-content-390px-mobile.png"),
      });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // CLIENTS SCREENSHOTS
  // ═══════════════════════════════════════════════════════════════

  test("Clients @390px - Screenshot", async ({ page }) => {
    await page.goto("/clients");
    await page.waitForLoadState("networkidle");
    await page.setViewportSize(SCREENSHOT_BREAKPOINTS.mobile);
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join("test-results", "screenshots", "clients-390px-mobile.png"),
      fullPage: true,
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PROJETS SCREENSHOTS
  // ═══════════════════════════════════════════════════════════════

  test("Projets @390px - Screenshot", async ({ page }) => {
    await page.goto("/projets");
    await page.waitForLoadState("networkidle");
    await page.setViewportSize(SCREENSHOT_BREAKPOINTS.mobile);
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join("test-results", "screenshots", "projets-390px-mobile.png"),
      fullPage: true,
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // REPORTS SCREENSHOTS
  // ═══════════════════════════════════════════════════════════════

  test("Reports @390px - Screenshot", async ({ page }) => {
    await page.goto("/reports");
    await page.waitForLoadState("networkidle");
    await page.setViewportSize(SCREENSHOT_BREAKPOINTS.mobile);
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join("test-results", "screenshots", "reports-390px-mobile.png"),
      fullPage: true,
    });
  });
});
