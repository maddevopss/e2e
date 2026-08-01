const { test, expect } = require('@playwright/test');
const { makeTestPassword } = require('./helpers/credentials');
const { unique } = require('./helpers/auth');
const { signupAndCompleteOnboardingUi } = require('./helpers/onboarding-ui');

// #310 écart identifié hors des points déjà réouverts par le mainteneur : aucun
// test e2e ne prouvait que finaliser une facture puis encaisser un paiement se
// répercute réellement sur le grand livre et les états financiers (le seul
// scénario existant, financial-cycle-p0, ne couvre que l'ancien registre
// ledger_entries/payment_events, pas le nouveau module comptabilité en partie
// double). Ce scénario ferme ce trou : client → projet → dépense refacturable →
// facture → finalisation → paiement → écritures publiées équilibrées → états
// financiers → isolation entre deux organisations.

async function captureAccess(page) {
  // L'auth web repose sur des cookies httpOnly (pas de header Authorization) :
  // page.request partage le contexte de navigation, donc les cookies suivent.
  const requestPromise = page.waitForRequest((request) => request.url().includes('/accounting/accounts'));
  await page.goto('/accounting');
  const accountingRequest = await requestPromise;
  const accountingBaseUrl = accountingRequest.url().replace(/\/accounting\/accounts(?:\?.*)?$/, '/accounting');
  return { accountingBaseUrl, apiBaseUrl: accountingBaseUrl.replace(/\/accounting$/, '') };
}

async function api(requestContext, baseUrl, path, options = {}) {
  return requestContext.fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

// Toutes les réponses passent par apiResponse.middleware.js : les corps déjà au
// format {success,code,data,timestamp} (routes qui appellent ApiResponse.success
// elles-mêmes, ex. /clients, /projets, /invoices) traversent inchangés — leur
// "data" EST directement la ressource (jamais {client:...}/{invoice:...}) ; les
// corps "nus" (ex. /accounting/entries → {entries:[...]}) sont enveloppés tels
// quels dans data. Dans les deux cas, défaire .data donne la bonne forme.
async function json(response) {
  const body = await response.json();
  return body && typeof body === 'object' && 'data' in body ? body.data : body;
}

test.describe('Fermeture du cycle revenu comptable', () => {
  test('facture finalisée, paiement encaissé et états financiers cohérents', async ({ page, browser }) => {
    const password = makeTestPassword();
    const tenantA = {
      organisation: unique('Revenu-A'),
      user: 'Administratrice revenu A',
      email: `${unique('revenue-a')}@example.com`,
      password,
    };

    await signupAndCompleteOnboardingUi(page, tenantA);
    const access = await captureAccess(page);

    const seedResponse = await api(page.request, access.accountingBaseUrl, '/accounts/seed', { method: 'POST', data: {} });
    expect(seedResponse.ok()).toBeTruthy();

    const client = await json(await api(page.request, access.apiBaseUrl, '/clients', {
      method: 'POST',
      data: { nom: unique('Client-Revenu'), email: `${unique('client')}@example.com` },
    }));
    expect(client?.id).toBeTruthy();

    const project = await json(await api(page.request, access.apiBaseUrl, '/projets', {
      method: 'POST',
      data: { nom: unique('Projet-Revenu'), client_id: client.id },
    }));
    expect(project?.id).toBeTruthy();

    const expense = await json(await api(page.request, access.apiBaseUrl, '/expenses', {
      method: 'POST',
      data: {
        projet_id: project.id,
        amount: 1000,
        tax_amount: 150,
        total_amount: 1150,
        category: 'general',
        expense_date: '2041-03-10',
        description: 'Dépense refacturable au client E2E',
        is_billable: true,
      },
    }));
    expect(expense?.id).toBeTruthy();

    const invoiceIdempotencyKey = unique('invoice-key');
    const invoice = await json(await api(page.request, access.apiBaseUrl, '/invoices', {
      method: 'POST',
      data: {
        client_id: client.id,
        expense_ids: [expense.id],
        tax_rate: 0,
        issue_date: '2041-03-15',
        due_date: '2041-04-15',
        idempotency_key: invoiceIdempotencyKey,
      },
    }));
    expect(invoice?.id).toBeTruthy();
    // Le montant refacturé est le prix de base de la dépense (1000$), pas son
    // total taxes incluses (1150$) : l'invoice applique son propre tax_rate sur
    // le sous-total plutôt que de reprendre les taxes déjà payées par l'organisation.
    expect(Number(invoice.total)).toBe(1000);

    const finalizedInvoice = await json(await api(page.request, access.apiBaseUrl, `/invoices/${invoice.id}/finalize`, { method: 'POST', data: {} }));
    expect(finalizedInvoice.status).toBe('finalized');

    // L'écriture de vente (comptes clients / revenus / taxes) doit être publiée et équilibrée
    const entriesAfterFinalize = (await json(await api(page.request, access.accountingBaseUrl, '/entries'))).entries;
    const saleEntry = entriesAfterFinalize.find((entry) => entry.source_type === 'invoice' && String(entry.source_id) === String(invoice.id));
    expect(saleEntry).toBeTruthy();
    expect(saleEntry.status).toBe('posted');
    const saleEntryDetail = await json(await api(page.request, access.accountingBaseUrl, `/entries/${saleEntry.id}`));
    expect(saleEntryDetail.totals).toMatchObject({ debit: 1000, credit: 1000, balanced: true });

    // Le paiement exige une facture 'sent' ou 'paid' (recordInvoicePayment) : la
    // finalisation seule (statut 'finalized') gèle la facture et publie l'écriture
    // de vente, mais l'envoi au client est une transition distincte et explicite.
    const sentInvoice = await json(await api(page.request, access.apiBaseUrl, `/invoices/${invoice.id}`, {
      method: 'PATCH',
      data: { status: 'sent' },
    }));
    expect(sentInvoice.status).toBe('sent');

    const paymentIdempotencyKey = unique('payment-key');
    const paymentResponse = await api(page.request, access.apiBaseUrl, `/invoice-payments/invoices/${invoice.id}`, {
      method: 'POST',
      data: {
        amount: 1000,
        method: 'bank_transfer',
        idempotency_key: paymentIdempotencyKey,
        received_at: '2041-03-20T12:00:00Z',
      },
    });
    expect(paymentResponse.status()).toBe(201);
    const payment = (await json(paymentResponse)).payment;
    expect(payment?.id).toBeTruthy();

    const invoiceAfterPayment = await json(await api(page.request, access.apiBaseUrl, `/invoices/${invoice.id}`));
    expect(invoiceAfterPayment.status).toBe('paid');

    // L'écriture d'encaissement (banque / comptes clients) doit elle aussi être publiée et équilibrée
    const entriesAfterPayment = (await json(await api(page.request, access.accountingBaseUrl, '/entries'))).entries;
    const paymentEntry = entriesAfterPayment.find((entry) => entry.source_type === 'invoice_payment' && String(entry.source_id) === String(payment.id));
    expect(paymentEntry).toBeTruthy();
    expect(paymentEntry.status).toBe('posted');
    const paymentEntryDetail = await json(await api(page.request, access.accountingBaseUrl, `/entries/${paymentEntry.id}`));
    expect(paymentEntryDetail.totals).toMatchObject({ debit: 1000, credit: 1000, balanced: true });

    // Rejeu idempotent : un second paiement avec la même clé ne publie pas de nouvelle écriture
    const duplicatePaymentResponse = await api(page.request, access.apiBaseUrl, `/invoice-payments/invoices/${invoice.id}`, {
      method: 'POST',
      data: { amount: 1000, method: 'bank_transfer', idempotency_key: paymentIdempotencyKey, received_at: '2041-03-20T12:00:00Z' },
    });
    expect(duplicatePaymentResponse.status()).toBe(200);
    expect((await json(duplicatePaymentResponse)).duplicate).toBe(true);

    // Balance de vérification équilibrée sur la période
    const trialBalance = await json(await api(page.request, access.accountingBaseUrl, '/trial-balance?startDate=2041-03-01&endDate=2041-03-31&previousStartDate=2041-02-01&previousEndDate=2041-02-28'));
    expect(trialBalance.isBalanced).toBe(true);

    // États financiers : le revenu comptabilisé correspond au sous-total de la facture (1000$,
    // sans taxes puisque tax_rate=0), et le bilan reste équilibré après l'encaissement.
    const statements = await json(await api(page.request, access.accountingBaseUrl, '/statements?startDate=2041-03-01&endDate=2041-03-31&previousStartDate=2041-02-01&previousEndDate=2041-02-28'));
    expect(statements.statements.incomeStatement.revenue.current).toBe(1000);
    expect(statements.statements.balanceSheet.isBalanced).toBe(true);

    // Isolation multi-organisation
    const tenantBContext = await browser.newContext();
    const tenantBPage = await tenantBContext.newPage();
    await signupAndCompleteOnboardingUi(tenantBPage, {
      organisation: unique('Revenu-B'),
      user: 'Administratrice revenu B',
      email: `${unique('revenue-b')}@example.com`,
      password,
    });
    const accessB = await captureAccess(tenantBPage);

    const forbiddenInvoice = await api(tenantBPage.request, accessB.apiBaseUrl, `/invoices/${invoice.id}`);
    expect(forbiddenInvoice.status()).toBe(404);

    const clientsB = (await json(await api(tenantBPage.request, accessB.apiBaseUrl, '/clients'))) || [];
    expect(clientsB.some((candidate) => String(candidate.id) === String(client.id))).toBeFalsy();

    const statementsB = await json(await api(tenantBPage.request, accessB.accountingBaseUrl, '/statements?startDate=2041-03-01&endDate=2041-03-31&previousStartDate=2041-02-01&previousEndDate=2041-02-28'));
    expect(statementsB.statements.incomeStatement.revenue.current).toBe(0);

    await tenantBContext.close();
  });
});
