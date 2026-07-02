const { test, expect } = require("@playwright/test");
const { apiLogin } = require("./helpers/auth");
test("navigation rapport", async ({ page, request }) => {
  await apiLogin(page, request);

  await page.getByText(/^Rapport$/i).click();

  await expect(page.getByText(/rapport/i).first()).toBeVisible();
});
