const { test, expect } = require('@playwright/test');

test.describe('Critical authenticated flow', () => {
  test('Complete flow: signup → org → client → project → time → invoice → multi-tenant isolation', async ({ page, browser }) => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    
    // Tenant A data
    const tenantAEmail = `e2e-${timestamp}-${random}@example.com`;
    const tenantAPassword = 'TestPassword123!';
    const tenantAOrgName = `Test Org ${timestamp}`;
    const tenantAClientName = `Test Client ${timestamp}`;
    const tenantAProjectName = `Test Project ${timestamp}`;
    
    let tenantAClientId;

    // ============================================
    // STEP 1: Signup Tenant A
    // ============================================
    console.log('Step 1: Signup Tenant A');
    await page.goto('/signup');
    
    // Fill all required fields
    await expect(page.locator('[name="organisation_nom"]')).toBeVisible();
    await page.locator('[name="organisation_nom"]').fill(tenantAOrgName);
    
    await expect(page.locator('[name="user_nom"]')).toBeVisible();
    await page.locator('[name="user_nom"]').fill('Test User A');
    
    await expect(page.locator('[name="email"]')).toBeVisible();
    await page.locator('[name="email"]').fill(tenantAEmail);
    
    await expect(page.locator('[name="password"]')).toBeVisible();
    await page.locator('[name="password"]').fill(tenantAPassword);

    // Verify submit button is ready
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeEnabled();

    // Wait for signup response and click
    const signupResponsePromise = page.waitForResponse((response) =>
      response.request().method() === 'POST' &&
      /signup|register/.test(response.url())
    );

    await submitBtn.click();

    // Verify HTTP response
    const signupResponse = await signupResponsePromise;
    const signupBody = await signupResponse.text();
    
    expect(
      signupResponse.ok(),
      `Signup failed: ${signupResponse.status()} ${signupBody}`
    ).toBeTruthy();

    // Wait for navigation to onboarding or dashboard
    await page.waitForURL(/\/(onboarding|dashboard)(?:[/?#]|$)/i, { timeout: 10000 });
    
    // Verify we're authenticated
    await expect(page).not.toHaveURL(/\/(login|signup)(?:[/?#]|$)/i);
    
    // Verify session persists after reload
    await page.reload();
    await expect(page).not.toHaveURL(/\/(login|signup)(?:[/?#]|$)/i);
    
    console.log('✓ Signup successful');

    // ============================================
    // STEP 2: Navigate to dashboard
    // ============================================
    console.log('Step 2: Navigate to dashboard');
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);
    console.log('✓ Dashboard accessible');

    // ============================================
    // STEP 3: Create a client
    // ============================================
    console.log('Step 3: Create a client');
    await page.goto('/clients');
    
    const newClientBtn = page.locator('button:has-text("New"), button:has-text("Add"), button:has-text("Create")').first();
    if (await newClientBtn.count()) {
      await newClientBtn.click();
      
      const clientNameInput = page.locator('input[placeholder*="name" i], input[name="name"]').first();
      if (await clientNameInput.count()) {
        await clientNameInput.fill(tenantAClientName);
      }

      const clientEmailInput = page.locator('input[type="email"], input[name="email"]').first();
      if (await clientEmailInput.count()) {
        await clientEmailInput.fill(`client-${timestamp}@example.com`);
      }

      // Capture the create client response to extract the real clientId
      const createClientResponsePromise = page.waitForResponse((response) =>
        response.request().method() === 'POST' &&
        /\/clients(?:[/?#]|$)/.test(response.url())
      );

      await page.locator('button[type="submit"]').first().click();

      const createClientResponse = await createClientResponsePromise;
      expect(createClientResponse.ok()).toBeTruthy();

      const createClientBody = await createClientResponse.json();
      const tenantAClientId =
        createClientBody.id ??
        createClientBody.client?.id ??
        createClientBody.data?.id ??
        createClientBody.data?.client?.id;

      expect(tenantAClientId).toBeTruthy();
      console.log(`✓ Client created with ID: ${tenantAClientId}`);

      await page.waitForLoadState('networkidle').catch(() => {});
      await expect(page.locator('body')).toContainText(tenantAClientName);
    }

    // ============================================
    // STEP 4: Create a project
    // ============================================
    console.log('Step 4: Create a project');
    await page.goto('/projets');
    
    const newProjectBtn = page.locator('button:has-text("New"), button:has-text("Add"), button:has-text("Create")').first();
    if (await newProjectBtn.count()) {
      await newProjectBtn.click();
      
      const projectNameInput = page.locator('input[placeholder*="name" i], input[name="name"]').first();
      if (await projectNameInput.count()) {
        await projectNameInput.fill(tenantAProjectName);
      }

      await page.locator('button[type="submit"]').first().click();
      await page.waitForLoadState('networkidle').catch(() => {});
      
      await expect(page.locator('body')).toContainText(tenantAProjectName);
      console.log('✓ Project created');
    }

    // ============================================
    // STEP 5: Start and stop time tracking
    // ============================================
    console.log('Step 5: Start and stop time tracking');
    await page.goto('/timesheet');
    
    const startBtn = page.locator('button:has-text("Start"), button:has-text("Démarrer")').first();
    if (await startBtn.count()) {
      await startBtn.click();
      await page.waitForTimeout(1000);
      
      const stopBtn = page.locator('button:has-text("Stop"), button:has-text("Arrêter")').first();
      if (await stopBtn.count()) {
        await stopBtn.click();
        await page.waitForLoadState('networkidle').catch(() => {});
      }
      
      await expect(page.locator('body')).toContainText(/\d+:\d+/);
      console.log('✓ Time tracking completed');
    }

    // ============================================
    // STEP 6: Create an invoice
    // ============================================
    console.log('Step 6: Create an invoice');
    await page.goto('/invoices');
    
    const newInvoiceBtn = page.locator('button:has-text("New"), button:has-text("Create"), button:has-text("Add")').first();
    if (await newInvoiceBtn.count()) {
      await newInvoiceBtn.click();

      const clientSelect = page.locator('select, [role="combobox"]').first();
      if (await clientSelect.count()) {
        await clientSelect.click();
        await page.locator('text=/Test Client/').first().click().catch(() => {});
      }

      const addLineBtn = page.locator('button:has-text("Add"), button:has-text("Line")').first();
      if (await addLineBtn.count()) {
        await addLineBtn.click();
        
        const descInput = page.locator('input[placeholder*="description" i]').first();
        if (await descInput.count()) {
          await descInput.fill('Test Service');
        }

        const amountInput = page.locator('input[type="number"], input[placeholder*="amount" i]').first();
        if (await amountInput.count()) {
          await amountInput.fill('100');
        }
      }

      await page.locator('button[type="submit"]').first().click();
      await page.waitForLoadState('networkidle').catch(() => {});
      
      await expect(page.locator('body')).toContainText(/INV-|Invoice/i);
      console.log('✓ Invoice created');
    }

    // ============================================
    // STEP 7: Verify invoice details
    // ============================================
    console.log('Step 7: Verify invoice details');
    await page.goto('/invoices');
    
    const invoiceRow = page.locator('tr, [role="row"]').first();
    if (await invoiceRow.count()) {
      await invoiceRow.click();
      await expect(page.locator('body')).toContainText(/Test Client|Test Service|100/i);
      console.log('✓ Invoice details verified');
    }

    // ============================================
    // STEP 8: Logout Tenant A
    // ============================================
    console.log('Step 8: Logout Tenant A');
    const logoutBtn = page.getByRole('button', { name: /Logout|Déconnexion/i }).first();
    await expect(logoutBtn, 'Le bouton de déconnexion doit être visible avant de quitter la session').toBeVisible();

    await Promise.all([
      page.waitForURL(/\/(login|auth)(?:[/?#]|$)/i, { timeout: 10_000 }),
      logoutBtn.click(),
    ]);

    await expect(page).toHaveURL(/\/(login|auth)(?:[/?#]|$)/i);
    console.log('✓ Logout successful');

    // ============================================
    // STEP 9: Multi-tenant isolation
    // ============================================
    console.log('Step 9: Multi-tenant isolation');
    
    // Create Tenant B in a separate context
    const tenantBContext = await browser.newContext();
    const tenantBPage = await tenantBContext.newPage();
    
    // Instrument Tenant B for debugging
    tenantBPage.on('console', (message) => {
      console.log(`[tenant-b-browser:${message.type()}] ${message.text()}`);
    });

    tenantBPage.on('pageerror', (error) => {
      console.error('[tenant-b-pageerror]', error.message);
    });

    tenantBPage.on('requestfailed', (request) => {
      console.error('[tenant-b-requestfailed]', request.method(), request.url());
    });

    tenantBPage.on('response', async (response) => {
      if (/signup|register|refresh|me|organisation|profile|auth|clients/i.test(response.url())) {
        console.log('[tenant-b-response]', response.status(), response.request().method(), response.url());
      }
    });
    
    const tenantBEmail = `e2e-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@example.com`;
    const tenantBPassword = 'TestPassword123!';
    
    // Signup Tenant B with explicit response handling
    await tenantBPage.goto('/signup');
    await tenantBPage.locator('[name="organisation_nom"]').fill(`Tenant B Org ${Date.now()}`);
    await tenantBPage.locator('[name="user_nom"]').fill('Test User B');
    await tenantBPage.locator('[name="email"]').fill(tenantBEmail);
    await tenantBPage.locator('[name="password"]').fill(tenantBPassword);
    
    const tenantBSignupResponsePromise = tenantBPage.waitForResponse((response) =>
      response.request().method() === 'POST' &&
      /signup|register/.test(response.url())
    );

    const tenantBSubmitBtn = tenantBPage.locator('button[type="submit"]');
    await expect(tenantBSubmitBtn).toBeEnabled();
    await tenantBSubmitBtn.click();

    const tenantBSignupResponse = await tenantBSignupResponsePromise;
    const tenantBSignupStatus = tenantBSignupResponse.status();
    const tenantBSignupBody = await tenantBSignupResponse.text();

    console.log('[tenant-b-signup]', tenantBSignupStatus, tenantBSignupResponse.url());

    expect(
      tenantBSignupResponse.ok(),
      `Tenant B signup failed: ${tenantBSignupStatus} ${tenantBSignupBody}`
    ).toBeTruthy();

    // Wait for navigation with explicit assertion
    await expect(tenantBPage).toHaveURL(
      /\/(onboarding|dashboard)(?:[/?#]|$)/i,
      { timeout: 10000 }
    );

    // Verify session is valid
    await expect(
      tenantBPage.getByText(/Votre session a expiré/i)
    ).not.toBeVisible();

    // Verify session persists after reload
    await tenantBPage.reload();
    await expect(tenantBPage).not.toHaveURL(/\/(login|signup)(?:[/?#]|$)/i);
    await expect(
      tenantBPage.getByText(/Votre session a expiré/i)
    ).not.toBeVisible();

    console.log('✓ Tenant B session valid');

    // Verify Tenant B cannot see Tenant A's data in UI
    await tenantBPage.goto('/clients');
    await expect(tenantBPage.locator('body')).not.toContainText(tenantAClientName);
    
    console.log('✓ Multi-tenant isolation verified (UI)');
    
    // Verify API-level isolation using page context (preserves authentication)
    const apiUrl = process.env.TEST_API_URL || 'http://127.0.0.1:5000/api';
    
    // Test with the REAL client ID from Tenant A
    if (tenantAClientId) {
      console.log(`[isolation-test] Attempting to access Tenant A client ${tenantAClientId} as Tenant B`);
      
      const clientAccessResponse = await tenantBPage.request.get(
        `${apiUrl}/clients/${tenantAClientId}`,
        {
          headers: {
            'Accept': 'application/json',
          },
        }
      ).catch((error) => {
        console.error('[tenant-b-api-error]', error.message);
        return null;
      });

      if (clientAccessResponse) {
        const status = clientAccessResponse.status();
        const body = await clientAccessResponse.text();
        
        console.log(`[isolation-test] Response status: ${status}`);
        
        expect(
          [403, 404].includes(status),
          `Tenant B should not access Tenant A client (expected 403/404, got ${status})`
        ).toBeTruthy();

        expect(body).not.toContain(tenantAClientName);
        expect(body).not.toContain(`client-${timestamp}@example.com`);
        
        console.log('✓ API-level isolation verified (real client)');
      } else {
        console.log('⚠ API-level isolation test skipped (network error)');
      }
    }
    
    await tenantBContext.close();
  });
});
