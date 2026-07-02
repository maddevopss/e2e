const { test, expect } = require("@playwright/test");
const { login } = require("./helpers/auth");

test("connexion utilisateur", async ({ page }) => {
  await login(page);
  await expect(page.getByText(/Bienvenue sur le tableau de bord/i)).toBeVisible();
});

test("déconnexion utilisateur", async ({ page, request }) => {
  await login(page);

  await page.getByText(/déconnexion/i).click();

  await expect(page).toHaveURL(/login/i);
  await expect(page.getByText(/connexion/i)).toBeVisible();
});

// test("debug page login", async ({ page, request }) => {
//   await page.goto("/login");

//   await page.waitForTimeout(1000);

//   console.log("URL:", page.url());
//   console.log("TITLE:", await page.title());
//   console.log("BODY:", await page.locator("body").innerText());
//   console.log("INPUT COUNT:", await page.locator("input").count());
//   console.log("BUTTON COUNT:", await page.locator("button").count());

//   await page.screenshot({
//     path: "test-results/login-debug.png",
//     fullPage: true,
//   });
// });

// test("debug routes", async ({ page, request }) => {
//   for (const route of ["/", "/login", "/connexion", "/auth", "/dashboard"]) {
//     await page.goto(route);
//     await page.waitForTimeout(500);

//     console.log("ROUTE:", route);
//     console.log("URL:", page.url());
//     console.log("BODY:", await page.locator("body").innerText());
//     console.log("INPUTS:", await page.locator("input").count());
//     console.log("BUTTONS:", await page.locator("button").count());
//   }
// });

// test("debug app crash", async ({ page, request }) => {
//   page.on("console", (msg) => {
//     console.log("BROWSER CONSOLE:", msg.type(), msg.text());
//   });

//   page.on("pageerror", (err) => {
//     console.log("PAGE ERROR:", err.message);
//     console.log(err.stack);
//   });

//   await page.goto("/");
//   await page.waitForTimeout(2000);

//   console.log("HTML:", await page.locator("#root").innerHTML());
//   console.log("BODY:", await page.locator("body").innerText());
// });
