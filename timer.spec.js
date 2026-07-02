const { test, expect } = require("@playwright/test");
const { apiLogin } = require("./helpers/auth");

test("timer visible sur dashboard", async ({ page, request }) => {
  await apiLogin(page, request);

  await expect(page.getByText(/gestion du temps/i)).toBeVisible();
  await expect(page.getByText(/00:00:00/i).first()).toBeVisible();
});
