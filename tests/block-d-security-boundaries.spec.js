const { test, expect } = require('@playwright/test');

const enabled = process.env.E2E_BLOCK_D_SECURITY === '1';

test.describe('Bloc D — frontières de sécurité', () => {
  test.skip(!enabled, 'Activer uniquement sur un environnement isolé avec E2E_BLOCK_D_SECURITY=1.');

  test('refuse les accès anonymes et les identifiants croisés', async ({ request }) => {
    const api = process.env.E2E_API_URL;
    if (!api) throw new Error('E2E_API_URL est requis.');

    const anonymous = await request.get(`${api}/api/clients`);
    expect([401, 403]).toContain(anonymous.status());

    const foreignId = process.env.E2E_FOREIGN_RESOURCE_ID;
    const token = process.env.E2E_TENANT_TOKEN;
    if (foreignId && token) {
      const crossTenant = await request.get(`${api}/api/clients/${foreignId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect([403, 404]).toContain(crossTenant.status());
    }
  });
});
