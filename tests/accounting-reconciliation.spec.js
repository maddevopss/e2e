const { test, expect } = require('@playwright/test');
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

async function getReconciliation(request, access) {
  return request.get(`${access.accountingBaseUrl}/reconciliation`, {
    headers: { authorization: access.authorization },
  });
}

test.describe('Rapprochement comptable', () => {
  test('diagnostic accessible et isolé entre deux organisations', async ({ page, browser, request }) => {
    const password = 'TestPassword123!';

    await signupAndCompleteOnboardingUi(page, {
      organisation: unique('Rapprochement-A'),
      user: 'Administrateur rapprochement A',
      email: `${unique('reconciliation-a')}@example.com`,
      password,
    });
    const accessA = await captureAccountingAccess(page);

    const responseA = await getReconciliation(request, accessA);
    expect(responseA.ok()).toBeTruthy();
    const resultA = await responseA.json();
    expect(resultA).toMatchObject({ healthy: true });
    expect(Array.isArray(resultA.anomalies)).toBe(true);
    expect(Array.isArray(resultA.orphans)).toBe(true);

    const tenantBContext = await browser.newContext();
    const tenantBPage = await tenantBContext.newPage();
    await signupAndCompleteOnboardingUi(tenantBPage, {
      organisation: unique('Rapprochement-B'),
      user: 'Administrateur rapprochement B',
      email: `${unique('reconciliation-b')}@example.com`,
      password,
    });
    const accessB = await captureAccountingAccess(tenantBPage);

    const responseB = await getReconciliation(request, accessB);
    expect(responseB.ok()).toBeTruthy();
    const resultB = await responseB.json();
    expect(resultB).toMatchObject({ healthy: true });
    expect(resultB.checked).toBe(0);
    expect(resultB.anomalies).toEqual([]);
    expect(resultB.orphans).toEqual([]);

    await tenantBContext.close();
  });
});
