const { expect, test } = require('@playwright/test');
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

const publicRoutes = [
  { name: 'home', path: '/' },
  { name: 'login', path: '/login' }
];

const protectedRoutes = [
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

const storageState = resolveStorageState();
const authRequired = process.env.E2E_AUTH_REQUIRED === '1';
const runProtectedRoutes = process.env.E2E_RUN_PROTECTED !== '0';
const stubPublicApi = !runProtectedRoutes && process.env.E2E_STUB_PUBLIC_API !== '0';

if (authRequired && !storageState) {
  throw new Error('E2E_AUTH_REQUIRED=1 but no auth storage state was found. Run npm run test:auth first or set E2E_AUTH_FILE.');
}

async function assertResponsiveShell(page, label) {
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
  await assertCriticalContentVisible(page);
  await assertNoHorizontalScroll(page, label);
}

test.beforeEach(async ({ page }) => {
  if (!stubPublicApi) return;

  await page.route(/^https?:\/\/[^/]+\/api\//, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, message: 'E2E public API stub' })
    })
  );
});

for (const viewport of viewports) {
  test.describe(`responsive ${viewport.name} ${viewport.width}px`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      storageState
    });

    for (const route of publicRoutes) {
      test(`public ${route.name} has no horizontal overflow`, async ({ page }) => {
        await page.goto(route.path, { waitUntil: 'domcontentloaded' });
        await assertResponsiveShell(page, `${route.name} @ ${viewport.width}px`);
      });
    }

    if (runProtectedRoutes) {
      for (const route of protectedRoutes) {
        test(`protected ${route.name} has safe authenticated responsive behavior`, async ({ page }) => {
          test.skip(!storageState, 'No auth storage state configured; protected responsive checks require authentication.');

          await page.goto(route.path, { waitUntil: 'domcontentloaded' });
          await expect(page).not.toHaveURL(/login|signin|auth/i);
          await assertResponsiveShell(page, `${route.name} @ ${viewport.width}px`);
        });
      }
    }
  });
}
