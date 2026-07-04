const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const uiAuth = require('../helpers/uiAuth');

const stateFile = path.resolve(process.cwd(), process.env.E2E_AUTH_FILE || 'storageState/auth.json');

test('prepare browser session', async ({ page }) => {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  await uiAuth.loginWithUi(page);
  await page.context().storageState({ path: stateFile });
});
