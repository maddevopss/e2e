const { test, expect } = require('@playwright/test');

const API_URL = process.env.TEST_API_URL || process.env.BACKEND_URL || process.env.API_URL || 'http://127.0.0.1:5000/api';
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('cycle complet continuité cognitive', () => {
  test.skip(!email || !password, 'Identifiants E2E requis.');

  test('événement de continuité et recommandations', async ({ request }) => {
    const login = await request.post(`${API_URL}/login`, { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    const loginBody = await login.json();
    const token = loginBody?.data?.token || loginBody?.token;
    const headers = { Authorization: `Bearer ${token}` };

    // --- Événement de continuité avec contexte structuré ---
    const eventResponse = await request.post(`${API_URL}/continuity/events`, {
      headers,
      data: { eventType: 'session_resume', context: { lastPage: '/dashboard', durationSeconds: 120 } },
    });
    expect(eventResponse.ok()).toBeTruthy();
    const event = (await eventResponse.json()).data.event;
    expect(event.event_type).toBe('session_resume');
    expect(event.context).toEqual({ lastPage: '/dashboard', durationSeconds: 120 });

    // --- Recommandations : liste (vide, aucune route de création n'existe dans ce module) ---
    const recommendationsResponse = await request.get(`${API_URL}/continuity/recommendations`, { headers });
    expect(recommendationsResponse.ok()).toBeTruthy();
    expect(Array.isArray((await recommendationsResponse.json()).data.recommendations)).toBe(true);

    // --- Refus d'un statut invalide ---
    const badStatusResponse = await request.patch(`${API_URL}/continuity/recommendations/999999`, {
      headers,
      data: { status: 'bogus' },
    });
    expect(badStatusResponse.status()).toBe(400);

    // --- Statut valide sur une recommandation inexistante : renvoie null sans erreur ---
    const missingResponse = await request.patch(`${API_URL}/continuity/recommendations/999999`, {
      headers,
      data: { status: 'accepted' },
    });
    expect(missingResponse.ok()).toBeTruthy();
    expect((await missingResponse.json()).data.recommendation).toBeNull();
  });
});
