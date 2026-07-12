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
  {
    name: 'modules',
    path: '/modules-and-subscription'
  }
];

function resolveStorageState() {
  const configured =
    process.env.E2E_AUTH_FILE ||
    'storageState/auth.json';

  const absolutePath = path.resolve(
    process.cwd(),
    configured
  );

  return fs.existsSync(absolutePath)
    ? absolutePath
    : undefined;
}

const storageState = resolveStorageState();

const authRequired =
  process.env.E2E_AUTH_REQUIRED === '1';

const runProtectedRoutes =
  process.env.E2E_RUN_PROTECTED !== '0';

const stubPublicApi =
  !runProtectedRoutes &&
  process.env.E2E_STUB_PUBLIC_API !== '0';

if (authRequired && !storageState) {
  throw new Error(
    'E2E_AUTH_REQUIRED=1 but no auth storage state was found. ' +
      'Run npm run test:auth first or set E2E_AUTH_FILE.'
  );
}

async function assertResponsiveShell(page, label) {
  await page
    .waitForLoadState('networkidle', {
      timeout: 3_000
    })
    .catch(() => {});

  await assertCriticalContentVisible(page);
  await assertNoHorizontalScroll(page, label);
}

test.beforeEach(async ({ page }) => {
  if (!stubPublicApi) {
    return;
  }

  await page.route(
    /^https?:\/\/[^/]+\/api\//,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          message: 'E2E public API stub'
        })
      })
  );
});

/*
 * Tests publics
 *
 * Aucun storageState n'est utilisé ici.
 * Cela évite que les pages publiques consomment ou fassent
 * tourner le refresh token.
 */
for (const viewport of viewports) {
  test.describe(
    `responsive public ${viewport.name} ${viewport.width}px`,
    () => {
      test.use({
        viewport: {
          width: viewport.width,
          height: viewport.height
        }
      });

      for (const route of publicRoutes) {
        test(
          `public ${route.name} has no horizontal overflow`,
          async ({ page }) => {
            await page.goto(route.path, {
              waitUntil: 'domcontentloaded'
            });

            await assertResponsiveShell(
              page,
              `${route.name} @ ${viewport.width}px`
            );
          }
        );
      }
    }
  );
}

/*
 * Tests protégés
 *
 * Un seul contexte authentifié est utilisé pour toutes les routes
 * et tous les viewports.
 *
 * Cela empêche plusieurs contextes Playwright de réutiliser le même
 * refresh token rotatif.
 */
if (runProtectedRoutes) {
  test.describe(
    'authenticated responsive routes',
    () => {
      test.use({
        storageState
      });

      test(
        'protected routes have safe authenticated responsive behavior',
        async ({ page }) => {
          test.setTimeout(120_000);

          test.skip(
            !storageState,
            'No auth storage state configured; protected responsive checks require authentication.'
          );

          const authFailures = [];
          const unavailableModules = new Set();

          page.on('response', async (response) => {
            const status = response.status();

            if (status !== 401 && status !== 403) {
              return;
            }

            const body = await response
              .text()
              .catch(() => '');

            let parsedBody = null;

            try {
              parsedBody = body
                ? JSON.parse(body)
                : null;
            } catch {
              parsedBody = null;
            }

            const isModuleUnavailable =
              status === 403 &&
              parsedBody?.code ===
                'MODULE_NOT_AVAILABLE';

            if (isModuleUnavailable) {
              const moduleKey =
                parsedBody?.errors?.module_key ||
                response.url();

              if (!unavailableModules.has(moduleKey)) {
                unavailableModules.add(moduleKey);

                console.log(
                  '[E2E MODULE UNAVAILABLE]',
                  moduleKey
                );
              }

              return;
            }

            const failure = {
              status,
              method:
                response.request().method(),
              url: response.url(),
              body: body.slice(0, 500)
            };

            authFailures.push(failure);

            console.error(
              '[E2E AUTH FAILURE]',
              failure.status,
              failure.method,
              failure.url,
              failure.body
            );
          });

          for (const viewport of viewports) {
            await test.step(
              `viewport ${viewport.name} ${viewport.width}px`,
              async () => {
                await page.setViewportSize({
                  width: viewport.width,
                  height: viewport.height
                });

                for (const route of protectedRoutes) {
                  await test.step(
                    `protected ${route.name}`,
                    async () => {
                      await page.goto(route.path, {
                        waitUntil:
                          'domcontentloaded'
                      });

                      await page
                        .waitForLoadState(
                          'networkidle',
                          {
                            timeout: 2_000
                          }
                        )
                        .catch(() => {});

                      if (
                        /\/(?:login|signin|auth)(?:\/|$|\?)/i.test(
                          page.url()
                        )
                      ) {
                        throw new Error(
                          [
                            `Protected route redirected to login: ${route.path}`,
                            `Viewport: ${viewport.name} ${viewport.width}px`,
                            `Auth failures: ${JSON.stringify(
                              authFailures,
                              null,
                              2
                            )}`
                          ].join('\n')
                        );
                      }

                      if (
                        authFailures.length > 0
                      ) {
                        throw new Error(
                          [
                            `Authentication failed while loading: ${route.path}`,
                            `Viewport: ${viewport.name} ${viewport.width}px`,
                            `Auth failures: ${JSON.stringify(
                              authFailures,
                              null,
                              2
                            )}`
                          ].join('\n')
                        );
                      }

                      await assertResponsiveShell(
                        page,
                        `${route.name} @ ${viewport.width}px`
                      );
                    }
                  );
                }
              }
            );
          }

          expect(
            authFailures,
            [
              'Authentication failures detected:',
              JSON.stringify(
                authFailures,
                null,
                2
              )
            ].join('\n')
          ).toEqual([]);

          if (unavailableModules.size > 0) {
            console.log(
              '[E2E MODULES SKIPPED BY PLAN]',
              [...unavailableModules].join(', ')
            );
          }
        }
      );
    }
  );
}