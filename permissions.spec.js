const { test, expect } = require("@playwright/test");
const { apiLogin, getToken } = require("./helpers/auth");

async function login(page, email, password) {
  await page.goto("/login");

  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);

  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/dashboard/i);
}

test("admin voit les sections de gestion", async ({ page, request }) => {
  await apiLogin(page, request);

  await expect(page.getByRole("link", { name: /^Client$/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Projet$/i })).toBeVisible();

  await expect(page.locator(".sidebar-user-info").getByText(/^admin$/i)).toBeVisible();
});

test("employé peut se connecter mais ne voit pas Admin", async ({ page, request }) => {
  await apiLogin(page, request);

  const adminToken = await getToken(page);

  const email = `employe.e2e.${Date.now()}@test.local`;
  const password = "Password123!";

  const userRes = await request.post("http://localhost:5000/api/users", {
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
    data: {
      nom: "Employe E2E",
      email,
      mot_de_passe: password,
      role: "employe",
    },
  });

  if (!userRes.ok()) {
    console.log("CREATE EMPLOYE STATUS:", userRes.status());
    console.log("CREATE EMPLOYE BODY:", await userRes.text());
  }

  expect(userRes.ok()).toBeTruthy();

  await page.getByText(/déconnexion/i).click();
  await expect(page).toHaveURL(/login/i);

  await login(page, email, password);

  await expect(page.locator(".sidebar-user-info").getByText(/^admin$/i)).not.toBeVisible();
});
