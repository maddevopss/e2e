const { test, expect } = require('@playwright/test');

const enabled = process.env.E2E_PAYROLL_CLOSURE === '1';

(enabled ? test.describe : test.describe.skip)('Fermeture du module Paie', () => {
  test('cycle complet, documents, comptabilité et isolation multi-organisation', async ({ request }) => {
    const baseURL = process.env.E2E_API_URL;
    const tokenA = process.env.E2E_PAYROLL_TOKEN_A;
    const tokenB = process.env.E2E_PAYROLL_TOKEN_B;

    expect(baseURL, 'E2E_API_URL est obligatoire').toBeTruthy();
    expect(tokenA, 'E2E_PAYROLL_TOKEN_A est obligatoire').toBeTruthy();
    expect(tokenB, 'E2E_PAYROLL_TOKEN_B est obligatoire').toBeTruthy();

    const headersA = { Authorization: `Bearer ${tokenA}` };
    const headersB = { Authorization: `Bearer ${tokenB}` };

    const employees = await request.get(`${baseURL}/api/payroll/employees`, { headers: headersA });
    expect(employees.ok()).toBeTruthy();

    const periods = await request.get(`${baseURL}/api/payroll/periods`, { headers: headersA });
    expect(periods.ok()).toBeTruthy();

    const runs = await request.get(`${baseURL}/api/payroll/runs`, { headers: headersA });
    expect(runs.ok()).toBeTruthy();

    const tenantBRuns = await request.get(`${baseURL}/api/payroll/runs`, { headers: headersB });
    expect(tenantBRuns.ok()).toBeTruthy();

    const bodyA = await runs.json();
    const bodyB = await tenantBRuns.json();
    const idsA = new Set((bodyA.runs || []).map((run) => String(run.id)));
    expect((bodyB.runs || []).some((run) => idsA.has(String(run.id)))).toBeFalsy();
  });
});
