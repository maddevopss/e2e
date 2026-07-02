const { test, expect } = require("@playwright/test");
const { apiLogin } = require("./helpers/auth");

test("navigation feuille de temps", async ({ page, request }) => {
  await apiLogin(page, request);

  await page.getByText(/feuilles de temps/i).click();

  await expect(page).toHaveURL(/timesheet/i);
});
