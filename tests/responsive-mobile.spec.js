const { test } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const {
  assertNoHorizontalScroll,
  assertCriticalContentVisible
} = require('../helpers/responsive');

const viewports = [
  { name: 'iphone-se', width: 375, height: 667 },
  { name: 'iphone-standard', width: 390, height: 844 },
  { name: 'large-mobile', width: 430, height: 932 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 }
];

const routes = [
  { name: 'home', path: '/' },
  { name: 'login', path: '/login' },
  { name: 'dashboard', path: '/dashboard' },
  { name: 'timesheet', path: '/timesheet' },
  { name: 'clients', path: '/clients' },
  { name: 'projets', path: '/projets' },
  { name: 'invoices', path: '/invoices' },
  { name: 'estimates', path: '/estimates' },
  { name: 'reports', path: '/reports' },
  { name: 'settings', path: '/settings' },
  { name: 'modules', path: '/modules-and-subscription' }
];

function resolveStorageState() {
  const configured = process.env.E2E_AUTH_FILE;
  if (!configured) return undefined;

  const absolutePath = path.resolve(process.cwd(), configured);
  return fs.existsSync(absolutePath) ? absolutePath : undefined;
}

for (const viewport of viewports) {
  test.describe(`responsive ${viewport.name} ${viewport.width}px`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      storageState: resolveStorageState()
    });

    for (const route of routes) {
      test(`${route.name} has no horizontal overflow`, async ({ page }) => {
        await page.goto(route.path, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => {});

        await assertCriticalContentVisible(page);
        await assertNoHorizontalScroll(page, `${route.name} @ ${viewport.width}px`);
      });
    }
  });
}
