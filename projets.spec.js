const { test, expect } = require("@playwright/test");
const { apiLogin } = require("./helpers/auth");

test("navigation projets", async ({ page, request }) => {
  await apiLogin(page, request);

  await page.getByRole("link", { name: /^Projet$/i }).click();

  await expect(page).toHaveURL(/projets|projects/i);
});
