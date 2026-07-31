const { test, expect } = require('@playwright/test');
const { makeTestPassword } = require('./helpers/credentials');
const { unique } = require('./helpers/auth');
const { signupAndCompleteOnboardingUi } = require('./helpers/onboarding-ui');

async function captureAccountingAccess(page) {
  const requestPromise = page.waitForRequest((request) => (
    request.url().includes('/accounting/accounts')
      && Boolean(request.headers().authorization)
  ));
  await page.goto('/accounting');
  const accountingRequest = await requestPromise;
  return {
    authorization: accountingRequest.headers().authorization,
    accountingBaseUrl: accountingRequest.url().replace(/\/accounting\/accounts(?:\?.*)?$/, '/accounting'),
  };
}

test.describe('Guidage des anomalies comptables', () => {
  test('le diagnostic exige une décision humaine et ne déclenche aucune correction', async ({ page, request }) => {
    const organisation = unique('Guidage-comptable');
    await signupAndCompleteOnboardingUi(page, {
      organisation,
      user: 'Responsable comptable',
      email: `${unique('accounting-guidance')}@example.com`,
      password: makeTestPassword(),
    });

    const access = await captureAccountingAccess(page);
    const response = await request.get(`${access.accountingBaseUrl}/reconciliation`, {
      headers: { authorization: access.authorization },
    });

    expect(response.ok()).toBeTruthy();
    const result = await response.json();
    expect(result).toHaveProperty('healthy');
    expect(result).toHaveProperty('requiresHumanDecision');
    expect(Array.isArray(result.anomalies)).toBe(true);
    expect(Array.isArray(result.orphanEntries)).toBe(true);

    for (const anomaly of result.anomalies) {
      expect(anomaly.remediation).toEqual(expect.objectContaining({
        action: expect.any(String),
        explanation: expect.any(String),
      }));
      expect(['none', 'create_adjustment', 'review_and_reverse', 'manual_review'])
        .toContain(anomaly.remediation.action);
    }

    const mutationRequests = [];
    page.on('request', (outgoing) => {
      if (outgoing.method() !== 'GET' && outgoing.url().includes('/accounting/')) {
        mutationRequests.push(`${outgoing.method()} ${outgoing.url()}`);
      }
    });

    await page.goto('/accounting');
    await expect(page.getByRole('heading', { name: 'Rapprochement comptable' })).toBeVisible();
    expect(mutationRequests).toEqual([]);
  });
});
