const { test, expect } = require('@playwright/test');
const { apiUrl, signup, unique } = require('./helpers/auth');

const modules = [
  { path: '/partners', heading: /partenaires externes/i, apiPath: '/partners' },
  { path: '/resilience', heading: /résilience institutionnelle/i, apiPath: '/resilience/events' },
  { path: '/assets', heading: /actifs|entretien/i, apiPath: '/assets/records' },
  { path: '/procurement', heading: /approvisionnement|achats/i, apiPath: '/procurement/requisitions' },
  { path: '/quality', heading: /qualité/i, apiPath: '/quality/plans' },
  { path: '/risks', heading: /risques/i, apiPath: '/risks' },
];

test.describe('Contrats des nouveaux modules métier', () => {
  test('les API existent et refusent les requêtes anonymes sans tomber en 404', async ({ request }) => {
    for (const module of modules) {
      const response = await request.get(`${apiUrl}${module.apiPath}`);
      expect(response.status(), `${module.apiPath} ne doit pas être introuvable`).not.toBe(404);
      expect([401, 403], `${module.apiPath} doit rester protégée`).toContain(response.status());
    }
  });

  test('un administrateur authentifié peut ouvrir chaque surface frontend', async ({ page }) => {
    await signup(page, {
      organisation: unique('Organisation-modules-metier'),
      user: 'Administrateur Modules Métier',
      email: `${unique('modules-metier')}@example.com`,
      password: 'TestPassword123!',
    });

    for (const module of modules) {
      await page.goto(module.path);
      await expect(page).toHaveURL(new RegExp(`${module.path}(?:[/?#]|$)`, 'i'));
      await expect(page.getByRole('heading', { name: module.heading }).first()).toBeVisible({ timeout: 15_000 });
    }
  });
});
