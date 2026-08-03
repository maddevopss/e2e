const { test, expect } = require('@playwright/test');
const crypto = require('crypto');

const API_URL = process.env.TEST_API_URL || process.env.BACKEND_URL || process.env.API_URL || 'http://127.0.0.1:5000/api';
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_PASSWORD;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

test.describe('cycle complet documents et preuves', () => {
  test.skip(!email || !password, 'Identifiants E2E requis.');

  test('document, versions (numéro et empreinte uniques), lien de preuve (idempotent) et alertes', async ({ request }) => {
    const suffix = Date.now();
    const login = await request.post(`${API_URL}/login`, { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    const loginBody = await login.json();
    const token = loginBody?.data?.token || loginBody?.token;
    const headers = { Authorization: `Bearer ${token}` };

    // --- Document : création, refus si numéro de document déjà pris ---
    const documentResponse = await request.post(`${API_URL}/documents/records`, {
      headers,
      data: { documentNumber: `DOC-${suffix}`, title: 'Politique de sécurité', documentType: 'policy', classification: 'confidential', retentionUntil: '2030-01-01' },
    });
    expect(documentResponse.ok()).toBeTruthy();
    const doc = (await documentResponse.json()).data;
    expect(doc.status).toBe('draft');
    expect(doc.current_version_id).toBeNull();

    const duplicateNumberResponse = await request.post(`${API_URL}/documents/records`, {
      headers,
      data: { documentNumber: `DOC-${suffix}`, title: 'Doublon', documentType: 'policy' },
    });
    expect(duplicateNumberResponse.status()).toBe(409);

    // --- Version : refus si même numéro de version sur le même document, puis version valide ---
    const versionResponse = await request.post(`${API_URL}/documents/records/${doc.id}/versions`, {
      headers,
      data: { version: '1.0', fileName: 'politique-v1.pdf', mimeType: 'application/pdf', storageKey: `s3://docs/${suffix}-v1`, byteSize: 204800, checksumSha256: sha256(`v1-${suffix}`), source: 'upload', effectiveFrom: '2026-08-01', metadata: { author: 'equipe-securite' } },
    });
    expect(versionResponse.ok()).toBeTruthy();
    const version = (await versionResponse.json()).data;
    expect(version.metadata).toEqual({ author: 'equipe-securite' });

    const duplicateVersionResponse = await request.post(`${API_URL}/documents/records/${doc.id}/versions`, {
      headers,
      data: { version: '1.0', fileName: 'doublon.pdf', mimeType: 'application/pdf', storageKey: `s3://docs/${suffix}-dup`, byteSize: 100, checksumSha256: sha256(`dup-${suffix}`), source: 'upload' },
    });
    expect(duplicateVersionResponse.status()).toBe(409);

    // --- Le document reflète désormais sa version courante ---
    const recordsListResponse = await request.get(`${API_URL}/documents/records`, { headers });
    expect(recordsListResponse.ok()).toBeTruthy();
    const updatedDoc = (await recordsListResponse.json()).data.find((r) => r.id === doc.id);
    expect(String(updatedDoc.current_version_id)).toBe(String(version.id));
    expect(updatedDoc.current_version).toBe('1.0');

    const versionsListResponse = await request.get(`${API_URL}/documents/records/${doc.id}/versions`, { headers });
    expect(versionsListResponse.ok()).toBeTruthy();
    expect((await versionsListResponse.json()).data.length).toBe(1);

    // --- Lien de preuve : création, puis rappel idempotent (même lien renvoyé, pas de doublon) ---
    const linkResponse = await request.post(`${API_URL}/documents/records/${doc.id}/links`, {
      headers,
      data: { aggregateType: 'hr_employee', aggregateId: 1, relation: 'policy_acknowledgement' },
    });
    expect(linkResponse.status()).toBe(201);
    const link = (await linkResponse.json()).data;

    const duplicateLinkResponse = await request.post(`${API_URL}/documents/records/${doc.id}/links`, {
      headers,
      data: { aggregateType: 'hr_employee', aggregateId: 1, relation: 'policy_acknowledgement' },
    });
    expect(duplicateLinkResponse.status()).toBe(200);
    expect((await duplicateLinkResponse.json()).data.id).toBe(link.id);

    const linksListResponse = await request.get(`${API_URL}/documents/links/hr_employee/1`, { headers });
    expect(linksListResponse.ok()).toBeTruthy();
    const links = (await linksListResponse.json()).data;
    expect(links.filter((l) => l.document_id === doc.id).length).toBe(1);

    // --- Alertes ---
    const alertsResponse = await request.get(`${API_URL}/documents/alerts`, { headers });
    expect(alertsResponse.ok()).toBeTruthy();
    const alerts = (await alertsResponse.json()).data;
    expect(alerts).toHaveProperty('retention');
    expect(alerts).toHaveProperty('unversioned');
  });
});
