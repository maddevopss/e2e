const { test, expect } = require('@playwright/test');

const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('cycle de paie complet', () => {
  test.skip(!email || !password, 'Identifiants E2E requis.');

  test('crée, calcule, approuve, paie et vérifie un cycle', async ({ request }) => {
    const login = await request.post('/api/login', { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    const loginBody = await login.json();
    const token = loginBody?.data?.token || loginBody?.token;
    const headers = { Authorization: `Bearer ${token}` };

    const rules = await request.get('/api/payroll/rulesets', { headers });
    expect(rules.ok()).toBeTruthy();
    const rulesBody = await rules.json();
    const activeRule = (rulesBody.rulesets || rulesBody.data?.rulesets || []).find((item) => item.status === 'active');
    expect(activeRule).toBeTruthy();

    const today = new Date().toISOString().slice(0, 10);
    const runResponse = await request.post('/api/payroll/runs', {
      headers,
      data: { periodStart: today, periodEnd: today, payDate: today, rulesetId: activeRule.id },
    });
    expect(runResponse.ok()).toBeTruthy();
    const runBody = await runResponse.json();
    const run = runBody.run || runBody.data?.run;

    const calculate = await request.post(`/api/payroll/runs/${run.id}/calculate`, {
      headers,
      data: { idempotencyKey: `e2e-payroll-${run.id}`, entries: [] },
    });
    expect(calculate.ok()).toBeTruthy();

    for (const action of ['approve', 'pay']) {
      const response = await request.post(`/api/payroll/runs/${run.id}/${action}`, {
        headers,
        data: { idempotencyKey: `e2e-payroll-${run.id}-${action}`, reason: 'Validation E2E' },
      });
      expect(response.ok()).toBeTruthy();
    }

    const register = await request.get(`/api/payroll/runs/${run.id}/register`, { headers });
    expect(register.ok()).toBeTruthy();
  });
});
