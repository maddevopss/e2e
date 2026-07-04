const { expect } = require("@playwright/test");
const path = require("path");
const dotenv = require("dotenv");

// Charger .env.test pour les credentials E2E
dotenv.config({
  path: path.resolve(__dirname, "../../backend/.env.test"),
  override: false,
});

const TEST_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.TEST_USER_EMAIL;
const TEST_PASSWORD = process.env.E2E_PASSWORD || process.env.TEST_USER_PASSWORD;
const TEST_API_URL = process.env.TEST_API_URL || "http://127.0.0.1:5000";

if (!TEST_EMAIL || !TEST_PASSWORD) {
  throw new Error("E2E_ADMIN_EMAIL and E2E_PASSWORD are required. Check backend/.env.test");
}

async function login(page) {
  await page.goto("/login");

  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);

  await page.click('button[type="submit"]');

  await expect(page).toHaveURL(/dashboard/i);
}

async function apiLogin(page, request) {
  // Authentifier via l'API directement
  console.log("🔐 E2E login email:", TEST_EMAIL);
  
  const loginResponse = await request.post(TEST_API_URL + "/api/login", {
    data: {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    },
  });

  if (!loginResponse.ok()) {
    const errorText = await loginResponse.text();
    throw new Error(`Login failed: ${loginResponse.status()} ${loginResponse.statusText()} - ${errorText}`);
  }

  const loginData = await loginResponse.json();
  console.log("✅ Login API response structure:", Object.keys(loginData));
  console.log("✅ Login user:", loginData.data?.user?.email, "org:", loginData.data?.user?.organisation_id);
  
  // Extraire le token de la réponse API
  // Structure attendue : { success: true, code: "...", data: { token: "...", user: {...} } }
  let token = null;
  
  if (loginData.data && loginData.data.token) {
    token = loginData.data.token;
  } else if (loginData.token) {
    token = loginData.token;
  } else if (loginData.access_token) {
    token = loginData.access_token;
  }
  
  if (!token || typeof token !== "string") {
    throw new Error(`apiLogin failed: token missing or invalid from response. Got: ${JSON.stringify(loginData)}`);
  }
  
  console.log("🔑 E2E token present:", Boolean(token), "length:", token.length);
  
  // Naviguer vers le dashboard pour capturer l'état de stockage
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");
  
  return token;
}

async function getToken(page) {
  const cookies = await page.context().cookies();

  return cookies.find((c) =>
    ["access_token", "jwt", "token"].includes(c.name)
  )?.value;
}

module.exports = { login, apiLogin, getToken };
