const { defineConfig, devices } = require('@playwright/test');
require('dotenv').config();
const path = require('path');

const authFile = path.resolve(
  __dirname,
  process.env.E2E_AUTH_FILE || 'storageState/auth.json'
);
const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
projects: [
  {
    name: 'auth-setup',
    testMatch: /auth-ui\.setup\.spec\.js/,
    use: {
      ...devices['Desktop Chrome']
    }
  },
  {
    name: 'chromium-desktop',
    dependencies: ['auth-setup'],
    testIgnore: /auth-ui\.setup\.spec\.js/,
    use: {
      ...devices['Desktop Chrome'],
      viewport: { width: 1440, height: 900 },
    }
  },
  {
    name: 'webkit-mobile',
    dependencies: ['auth-setup'],
    testIgnore: /auth-ui\.setup\.spec\.js/,
    use: {
      ...devices['iPhone 13'],
    }
  },
  {
    name: 'chromium-mobile',
    dependencies: ['auth-setup'],
    testIgnore: /auth-ui\.setup\.spec\.js/,
    use: {
      ...devices['Pixel 5'],
    }
  }
]
});
