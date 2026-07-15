const { defineConfig, devices } = require('@playwright/test');
const path = require('path');
require('dotenv').config();

const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
const backendURL = process.env.TEST_API_URL || 'http://127.0.0.1:5000/api';

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
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  webServer: [
    {
      command: 'npm --prefix ../backend run start',
      url: `${backendURL}/system/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe'
    },
    {
      command: 'npm --prefix ../frontend run dev -- --host 127.0.0.1 --port 3000',
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe'
    }
  ],
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }
    },
    {
      name: 'webkit-mobile',
      use: { ...devices['iPhone 13'] }
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 5'] }
    }
  ]
});
