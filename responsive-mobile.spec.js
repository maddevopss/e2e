const { test, expect } = require("@playwright/test");
const { login } = require("./helpers/auth");

// Breakpoints à tester
const BREAKPOINTS = {
  mobile_small: { width: 375, height: 667, name: "375px (iPhone SE)" },
  mobile_standard: { width: 390, height: 844, name: "390px (iPhone 12/13/14/15)" },
  mobile_large: { width: 430, height: 932, name: "430px (Grands mobiles)" },
  tablet: { width: 768, height: 1024, name: "768px (Tablet)" },
  desktop: { width: 1440, height: 900, name: "1440px (Desktop)" },
};

// Assertion helper: vérifier qu'il n'y a pas de scroll horizontal
async function assertNoHorizontalScroll(page, breakpoint) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  const tolerance = 2; // Tolérance pour les arrondis

  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + tolerance);
}

// Assertion helper: vérifier qu'un élément est visible dans le viewport
async function assertElementInViewport(page, selector) {
  const element = page.locator(selector).first();
  await expect(element).toBeVisible();

  const box = await element.boundingBox();
  if (box) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
  }
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD RESPONSIVE TESTS
// ═══════════════════════════════════════════════════════════════

test.describe("Dashboard - Responsive Mobile", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
  });

  Object.entries(BREAKPOINTS).forEach(([key, breakpoint]) => {
    test(`Dashboard @${breakpoint.name} - No horizontal scroll`, async ({ page }) => {
      await page.setViewportSize({ width: breakpoint.width, height: breakpoint.height });
      await page.waitForTimeout(500); // Attendre le reflow

      await assertNoHorizontalScroll(page, breakpoint.name);
    });

    test(`Dashboard @${breakpoint.name} - Main content visible`, async ({ page }) => {
      await page.setViewportSize({ width: breakpoint.width, height: breakpoint.height });
      await page.waitForTimeout(500);

      // Vérifier que le contenu principal est visible
      const mainContent = page.locator(".main");
      await expect(mainContent).toBeVisible();

      // Vérifier qu'au moins une carte est visible
      const cards = page.locator(".dashboard-metric-card, .card");
      const count = await cards.count();
      expect(count).toBeGreaterThan(0);
    });
  });

  test("Dashboard @390px - Cards in single column", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);

    // Vérifier que les cartes sont en colonne unique
    const metricsGrid = page.locator(".dashboard-metrics-grid");
    const gridStyle = await metricsGrid.evaluate((el) => window.getComputedStyle(el).gridTemplateColumns);

    // Sur mobile, doit être 1fr (une colonne)
    expect(gridStyle).toMatch(/1fr/);
  });

  test("Dashboard @1440px - Cards in multi-column", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(500);

    // Vérifier que les cartes sont en multi-colonnes
    const metricsGrid = page.locator(".dashboard-metrics-grid");
    const gridStyle = await metricsGrid.evaluate((el) => window.getComputedStyle(el).gridTemplateColumns);

    // Sur desktop, doit avoir plusieurs colonnes
    expect(gridStyle).not.toMatch(/^1fr$/);
  });
});

// ═══════════════════════════════════════════════════════════════
// TIMESHEET RESPONSIVE TESTS
// ═══════════════════════════════════════════════════════════════

test.describe("Timesheet - Responsive Mobile", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/timesheet");
    await page.waitForLoadState("networkidle");
  });

  test("Timesheet @390px - No horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);

    await assertNoHorizontalScroll(page, "390px");
  });

  test("Timesheet @390px - Stats in single column", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);

    const statsGrid = page.locator(".timesheet-stats");
    if (await statsGrid.count() > 0) {
      const gridStyle = await statsGrid.evaluate((el) => window.getComputedStyle(el).gridTemplateColumns);
      expect(gridStyle).toMatch(/1fr/);
    }
  });

  test("Timesheet @768px - No horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(500);

    await assertNoHorizontalScroll(page, "768px");
  });
});

// ═══════════════════════════════════════════════════════════════
// CLIENTS RESPONSIVE TESTS
// ═══════════════════════════════════════════════════════════════

test.describe("Clients - Responsive Mobile", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/clients");
    await page.waitForLoadState("networkidle");
  });

  test("Clients @390px - No horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);

    await assertNoHorizontalScroll(page, "390px");
  });

  test("Clients @390px - Grid in single column", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);

    const grid = page.locator(".clients-grid");
    if (await grid.count() > 0) {
      const gridStyle = await grid.evaluate((el) => window.getComputedStyle(el).gridTemplateColumns);
      expect(gridStyle).toMatch(/1fr/);
    }
  });

  test("Clients @1440px - Grid in multi-column", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(500);

    const grid = page.locator(".clients-grid");
    if (await grid.count() > 0) {
      const gridStyle = await grid.evaluate((el) => window.getComputedStyle(el).gridTemplateColumns);
      expect(gridStyle).not.toMatch(/^1fr$/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// PROJETS RESPONSIVE TESTS
// ═══════════════════════════════════════════════════════════════

test.describe("Projets - Responsive Mobile", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/projets");
    await page.waitForLoadState("networkidle");
  });

  test("Projets @390px - No horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);

    await assertNoHorizontalScroll(page, "390px");
  });

  test("Projets @390px - Grid in single column", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);

    const grid = page.locator(".projects-grid");
    if (await grid.count() > 0) {
      const gridStyle = await grid.evaluate((el) => window.getComputedStyle(el).gridTemplateColumns);
      expect(gridStyle).toMatch(/1fr/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// INVOICES RESPONSIVE TESTS
// ═══════════════════════════════════════════════════════════════

test.describe("Invoices - Responsive Mobile", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/invoices");
    await page.waitForLoadState("networkidle");
  });

  test("Invoices @390px - No horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);

    await assertNoHorizontalScroll(page, "390px");
  });

  test("Invoices @390px - List in single column", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);

    const list = page.locator(".invoices-list");
    if (await list.count() > 0) {
      const gridStyle = await list.evaluate((el) => window.getComputedStyle(el).gridTemplateColumns);
      expect(gridStyle).toMatch(/1fr/);
    }
  });

  test("Invoices @390px - Tables have internal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);

    const tableWrap = page.locator(".view-invoice-table-wrap");
    if (await tableWrap.count() > 0) {
      const overflow = await tableWrap.evaluate((el) => window.getComputedStyle(el).overflowX);
      expect(overflow).toBe("auto");
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// REPORTS RESPONSIVE TESTS
// ═══════════════════════════════════════════════════════════════

test.describe("Reports - Responsive Mobile", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/reports");
    await page.waitForLoadState("networkidle");
  });

  test("Reports @390px - No horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);

    await assertNoHorizontalScroll(page, "390px");
  });

  test("Reports @390px - Charts in single column", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);

    const chartsGrid = page.locator(".analytics-charts-grid");
    if (await chartsGrid.count() > 0) {
      const gridStyle = await chartsGrid.evaluate((el) => window.getComputedStyle(el).gridTemplateColumns);
      expect(gridStyle).toMatch(/1fr/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// SETTINGS RESPONSIVE TESTS
// ═══════════════════════════════════════════════════════════════

test.describe("Settings - Responsive Mobile", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
  });

  test("Settings @390px - No horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);

    await assertNoHorizontalScroll(page, "390px");
  });

  test("Settings @390px - Forms are responsive", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);

    const forms = page.locator("form");
    const count = await forms.count();

    if (count > 0) {
      for (let i = 0; i < Math.min(count, 3); i++) {
        const form = forms.nth(i);
        const width = await form.evaluate((el) => el.offsetWidth);
        const parentWidth = await form.evaluate((el) => el.parentElement.offsetWidth);

        expect(width).toBeLessThanOrEqual(parentWidth + 2); // Tolérance 2px
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// AI COPILOT RESPONSIVE TESTS
// ═══════════════════════════════════════════════════════════════

test.describe("AI Copilot - Responsive Mobile", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
  });

  test("AI Copilot @390px - Stays in viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);

    const copilot = page.locator(".ai-copilot-launcher");
    if (await copilot.count() > 0) {
      const box = await copilot.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(844);
    }
  });

  test("AI Copilot @390px - Window fits in viewport when open", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);

    const launcher = page.locator(".ai-copilot-launcher");
    if (await launcher.count() > 0) {
      await launcher.click();
      await page.waitForTimeout(300);

      const window = page.locator(".ai-copilot-window");
      if (await window.count() > 0) {
        const box = await window.boundingBox();
        expect(box.width).toBeLessThanOrEqual(390);
        expect(box.height).toBeLessThanOrEqual(844);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// GLOBAL RESPONSIVE TESTS
// ═══════════════════════════════════════════════════════════════

test.describe("Global - Responsive Mobile", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("Header @390px - No horizontal scroll", async ({ page }) => {
    await page.goto("/dashboard");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);

    const header = page.locator(".header");
    await expect(header).toBeVisible();

    await assertNoHorizontalScroll(page, "390px");
  });

  test("Sidebar @390px - Hidden on mobile", async ({ page }) => {
    await page.goto("/dashboard");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);

    const sidebar = page.locator(".sidebar");
    const display = await sidebar.evaluate((el) => window.getComputedStyle(el).display);

    expect(display).toBe("none");
  });

  test("Sidebar @768px - Visible on tablet", async ({ page }) => {
    await page.goto("/dashboard");
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(500);

    const sidebar = page.locator(".sidebar");
    const display = await sidebar.evaluate((el) => window.getComputedStyle(el).display);

    expect(display).not.toBe("none");
  });

  test("Main content @390px - Full width", async ({ page }) => {
    await page.goto("/dashboard");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);

    const main = page.locator(".main");
    const width = await main.evaluate((el) => el.offsetWidth);

    // Doit être proche de la largeur du viewport (390px)
    expect(width).toBeGreaterThan(350);
    expect(width).toBeLessThanOrEqual(390);
  });
});
