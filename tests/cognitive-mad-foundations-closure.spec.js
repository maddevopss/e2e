const { test, expect } = require('@playwright/test');

const enabled = process.env.E2E_PLATFORM_FOUNDATIONS_CLOSURE === '1';

(enabled ? test.describe : test.describe.skip)('Fermeture Continuité cognitive et Fondations MAD', () => {
  test('conserve un point de reprise et une décision humaine explicite', async ({ page }) => {
    let savedContext = null;
    let humanDecision = null;

    await page.route('**/api/continuity/recommendations', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ recommendations: [{ id: 77, title: 'Reprendre la validation', explanation: 'Une étape vérifiable demeure incomplète.' }] }) });
    });
    await page.route('**/api/continuity/events', async (route) => {
      savedContext = route.request().postDataJSON();
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ event: { id: 88 } }) });
    });
    await page.route('**/api/continuity/recommendations/77', async (route) => {
      humanDecision = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ recommendation: { id: 77, status: humanDecision.status } }) });
    });

    await page.goto('/continuity');
    await expect(page.getByRole('heading', { name: 'Continuité cognitive' })).toBeVisible();
    await page.getByLabel('Objectif courant').fill('Finaliser le dossier vérifiable');
    await page.getByLabel('Prochaine action').fill('Relire la preuve avant confirmation');
    await page.getByRole('button', { name: 'Enregistrer le contexte' }).click();

    expect(savedContext).toEqual({ eventType: 'work_context_saved', context: { goal: 'Finaliser le dossier vérifiable', nextAction: 'Relire la preuve avant confirmation' } });
    await page.getByRole('button', { name: 'Accepter' }).click();
    expect(humanDecision).toEqual({ status: 'accepted' });
  });

  test('rend les fondations compréhensibles et maintient la responsabilité humaine', async ({ page }) => {
    await page.goto('/mad-foundation');
    await expect(page.getByRole('heading', { name: 'Fondations MAD' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Comprendre avant d’agir' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Prouver ce qui s’est passé' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Garder l’humain responsable' })).toBeVisible();
    await expect(page.getByLabel('Responsabilité humaine')).toContainText('la responsabilité finale demeure humaine');
  });
});
