const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { login } = require('../helpers/auth');

const authFile = path.resolve(process.cwd(), process.env.E2E_AUTH_FILE || 'storageState/auth.json');

test('create authenticated browser state', async ({ page }) => {
  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await login(page);
  await page.context().storageState({ path: authFile });
});
