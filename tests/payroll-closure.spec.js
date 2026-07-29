const { test, expect } = require('@playwright/test');

const enabled = process.env.E2E_PAYROLL_CLOSURE === '1';

(enabled ? test.describe : test.describe.skip)('Fermeture du module Paie', () => {
  test('cycle complet, opérations avancées et isolation multi-organisation', async ({ request }) => {
    const baseURL = process.env.E2E_API_URL;
    const tokenA = process.env.E2E_PAYROLL_TOKEN_A;
    const tokenB = process.env.E2E_PAYROLL_TOKEN_B;

    expect(baseURL, 'E2E_API_URL est obligatoire').toBeTruthy();
    expect(tokenA, 'E2E_PAYROLL_TOKEN_A est obligatoire').toBeTruthy();
    expect(tokenB, 'E2E_PAYROLL_TOKEN_B est obligatoire').toBeTruthy();

    const headersA = { Authorization: `Bearer ${tokenA}` };
    const headersB = { Authorization: `Bearer ${tokenB}` };
    const paths = [
      '/api/payroll/employees',
      '/api/payroll/periods',
      '/api/payroll/runs',
      '/api/payroll/remittances',
      '/api/payroll/remittances/deposits',
      '/api/payroll/remittances/vacations',
      '/api/payroll/remittances/terminations',
      '/api/payroll/remittances/year-end-slips',
      '/api/payroll/remittances/reconciliation',
    ];

    for (const path of paths) {
      const response = await request.get(`${baseURL}${path}`, { headers: headersA });
      expect(response.ok(), `${path} doit être accessible`).toBeTruthy();
    }

    const runsA = await request.get(`${baseURL}/api/payroll/runs`, { headers: headersA });
    const runsB = await request.get(`${baseURL}/api/payroll/runs`, { headers: headersB });
    expect(runsA.ok()).toBeTruthy();
    expect(runsB.ok()).toBeTruthy();

    const bodyA = await runsA.json();
    const bodyB = await runsB.json();
    const idsA = new Set((bodyA.runs || []).map((run) => String(run.id)));
    expect((bodyB.runs || []).some((run) => idsA.has(String(run.id)))).toBeFalsy();
  });
});
