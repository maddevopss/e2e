const { expect } = require("@playwright/test");

const TEST_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD;

async function login(page) {
  await page.goto("/login");

  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);

  await page.click('button[type="submit"]');

  await expect(page).toHaveURL(/dashboard/i);
}

async function getToken(page) {
  const cookies = await page.context().cookies();

  return cookies.find((c) =>
    ["access_token", "jwt", "token"].includes(c.name)
  )?.value;
}

module.exports = { login, getToken };