const { test, expect } = require('@playwright/test');

const apiUrl = process.env.TEST_API_URL || 'http://127.0.0.1:5000/api';

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function accessToken(body) {
  return body?.data?.token ?? body?.data?.access_token ?? body?.data?.accessToken ??
    body?.token ?? body?.access_token ?? body?.accessToken;
}

function entity(body, key) {
  return body?.data?.[key] ?? body?.[key] ?? body?.data ?? body;
}

async function json(response, label) {
  const text = await response.text();
  expect(response.ok(), `${label}: ${response.status()} ${text}`).toBeTruthy();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} doit retourner du JSON. Corps reçu: ${text}`);
  }
}

async function signup(page, account) {
  await page.goto('/signup');
  await page.locator('[name="organisation_nom"]').fill(account.organisation);
  await page.locator('[name="user_nom"]').fill(account.user);
  await page.locator('[name="email"]').fill(account.email);
  await page.locator('[name="password"]').fill(account.password);

  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === 'POST' && /signup|register/i.test(response.url())
  );
  await page.locator('button[type="submit"]').click();
  const body = await json(await responsePromise, 'Inscription');
  const token = accessToken(body);
  expect(token, 'Un jeton d’accès réel est requis').toBeTruthy();
  await expect(page).toHaveURL(/\/(onboarding|dashboard)(?:[/?#]|$)/i, { timeout: 15_000 });
  return `Bearer ${token}`;
}

async function apiRequest(context, authorization, method, path, data) {
  const response = await context.request.fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      authorization,
      ...(data ? { 'content-type': 'application/json' } : {}),
    },
    ...(data ? { data } : {}),
  });
  return { response, body: await json(response, `${method} ${path}`) };
}

test.describe('Parcours commercial prospect vers client', () => {
  test('suit, qualifie et convertit un prospect sans fuite entre organisations', async ({ browser }) => {
    const password = 'TestPassword123!';
    const prospectName = unique('Prospect-A');
    const companyName = unique('Entreprise-A');
    const followupSubject = unique('Relance-A');

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    const authorizationA = await signup(pageA, {
      organisation: unique('Organisation-A'),
      user: 'Administrateur A',
      email: `${unique('admin-a')}@example.com`,
      password,
    });

    const createdLead = await apiRequest(contextA, authorizationA, 'POST', '/customer-growth/leads', {
      display_name: prospectName,
      company_name: companyName,
      email: `${unique('prospect')}@example.com`,
      source: 'E2E',
      notes: 'Prospect créé par la preuve E2E.',
    });
    const lead = entity(createdLead.body, 'lead');
    expect(lead.id).toBeTruthy();
    expect(lead.status).toBe('new');

    const dueAt = new Date(Date.now() + 86_400_000).toISOString();
    const createdActivity = await apiRequest(contextA, authorizationA, 'POST', '/customer-growth/activities', {
      lead_id: lead.id,
      opportunity_id: null,
      activity_type: 'task',
      task_status: 'pending',
      subject: followupSubject,
      details: 'Rappeler le prospect demain.',
      due_at: dueAt,
      completed_at: null,
    });
    const activity = entity(createdActivity.body, 'activity');
    expect(activity.id).toBeTruthy();
    expect(activity.task_status).toBe('pending');

    await apiRequest(contextA, authorizationA, 'PATCH', `/customer-growth/activities/${activity.id}`, {
      task_status: 'completed',
    });
    await apiRequest(contextA, authorizationA, 'PATCH', `/customer-growth/leads/${lead.id}`, {
      status: 'contacted',
    });
    await apiRequest(contextA, authorizationA, 'PATCH', `/customer-growth/leads/${lead.id}`, {
      status: 'qualified',
    });

    const conversion = await apiRequest(contextA, authorizationA, 'POST', `/customer-growth/leads/${lead.id}/convert`, {
      idempotency_key: `e2e-lead-${lead.id}-conversion`,
    });
    const client = entity(conversion.body, 'client');
    expect(client.id).toBeTruthy();

    await pageA.goto('/clients');
    await expect(pageA.locator('body')).toContainText(companyName, { timeout: 15_000 });

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const authorizationB = await signup(pageB, {
      organisation: unique('Organisation-B'),
      user: 'Administrateur B',
      email: `${unique('admin-b')}@example.com`,
      password,
    });

    const leadsB = await apiRequest(contextB, authorizationB, 'GET', '/customer-growth/leads?limit=100&offset=0');
    expect(JSON.stringify(leadsB.body)).not.toContain(prospectName);
    expect(JSON.stringify(leadsB.body)).not.toContain(companyName);
    expect(JSON.stringify(leadsB.body)).not.toContain(followupSubject);

    const activitiesB = await apiRequest(contextB, authorizationB, 'GET', `/customer-growth/activities?lead_id=${lead.id}&limit=100&offset=0`);
    expect(JSON.stringify(activitiesB.body)).not.toContain(followupSubject);

    const crossLead = await contextB.request.get(`${apiUrl}/customer-growth/leads/${lead.id}`, {
      headers: { accept: 'application/json', authorization: authorizationB },
    });
    expect([403, 404]).toContain(crossLead.status());
    expect(await crossLead.text()).not.toContain(prospectName);

    const crossClient = await contextB.request.get(`${apiUrl}/clients/${client.id}`, {
      headers: { accept: 'application/json', authorization: authorizationB },
    });
    expect([403, 404]).toContain(crossClient.status());
    expect(await crossClient.text()).not.toContain(companyName);

    await pageB.goto('/clients');
    await expect(pageB.locator('body')).not.toContainText(companyName);

    await contextA.close();
    await contextB.close();
  });
});
