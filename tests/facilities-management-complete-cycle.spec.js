const { test, expect } = require('@playwright/test');

const API_URL = process.env.TEST_API_URL || process.env.BACKEND_URL || process.env.API_URL || 'http://127.0.0.1:5000/api';
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('cycle complet biens et installations', () => {
  test.skip(!email || !password, 'Identifiants E2E requis.');

  test('site, espace, actif (lien croisé, décommission), inspection, transfert et disposition', async ({ request }) => {
    const suffix = Date.now();
    const login = await request.post(`${API_URL}/login`, { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    const loginBody = await login.json();
    const token = loginBody?.data?.token || loginBody?.token;
    const headers = { Authorization: `Bearer ${token}` };
    const withKey = (key) => ({ ...headers, 'Idempotency-Key': `e2e-fac-${suffix}-${key}` });

    // --- Site : refus sans responsable/preuve, puis création valide ---
    const badSiteResponse = await request.post(`${API_URL}/facilities/sites`, {
      headers: withKey('s-bad'),
      data: { siteCode: `SITE-${suffix}`, name: 'Usine A', siteType: 'industrial' },
    });
    expect(badSiteResponse.status()).toBe(409);

    const siteResponse = await request.post(`${API_URL}/facilities/sites`, {
      headers: withKey('site'),
      data: { siteCode: `SITE-${suffix}`, name: 'Usine A', siteType: 'industrial', address: { city: 'Montréal' }, responsibleUserId: 1, evidence: ['acte-propriété.pdf'] },
    });
    expect(siteResponse.ok()).toBeTruthy();
    const site = (await siteResponse.json()).data;

    // --- Espace ---
    const spaceResponse = await request.post(`${API_URL}/facilities/spaces`, {
      headers: withKey('space'),
      data: { siteId: site.id, spaceCode: `ZONE-A1-${suffix}`, name: 'Atelier principal', spaceType: 'production', responsibleUserId: 1, capacity: 50, capacityUnit: 'personnes', evidence: ['plan-étage.pdf'] },
    });
    expect(spaceResponse.ok()).toBeTruthy();
    const space = (await spaceResponse.json()).data;

    // --- Actif d'installation ---
    const facilityAssetResponse = await request.post(`${API_URL}/facilities/assets`, {
      headers,
      data: { siteId: site.id, spaceId: space.id, assetCode: `FAC-${suffix}`, name: 'Compresseur industriel', assetType: 'equipment', responsibleUserId: 1, criticality: 'high', evidence: ['facture.pdf'] },
    });
    expect(facilityAssetResponse.ok()).toBeTruthy();
    const facilityAsset = (await facilityAssetResponse.json()).data;

    // --- Lien croisé vers le module actifs et entretien : refus sans clé d'idempotence ---
    const missingKeyLinkResponse = await request.post(`${API_URL}/facilities/maintenance-links`, {
      headers,
      data: { facilitiesAssetId: facilityAsset.id, maintenanceAssetId: 1, justification: 'Même actif physique' },
    });
    expect(missingKeyLinkResponse.status()).toBe(400);

    const maintenanceRecordResponse = await request.post(`${API_URL}/assets/records`, {
      headers,
      data: { assetCode: `MAINT-${suffix}`, name: 'Compresseur industriel', assetType: 'equipment' },
    });
    expect(maintenanceRecordResponse.ok()).toBeTruthy();
    const maintenanceRecord = (await maintenanceRecordResponse.json()).data;

    const linkResponse = await request.post(`${API_URL}/facilities/maintenance-links`, {
      headers: withKey('link'),
      data: { facilitiesAssetId: facilityAsset.id, maintenanceAssetId: maintenanceRecord.id, justification: 'Même actif physique', evidence: ['corrélation.pdf'] },
    });
    expect(linkResponse.ok()).toBeTruthy();

    // --- Décommission : refus sans preuve, puis décommission valide ---
    const badDecommissionResponse = await request.post(`${API_URL}/facilities/assets/${facilityAsset.id}/decommission`, {
      headers: withKey('dec-bad'),
      data: { reason: 'Fin de vie' },
    });
    expect(badDecommissionResponse.status()).toBe(409);

    const decommissionResponse = await request.post(`${API_URL}/facilities/assets/${facilityAsset.id}/decommission`, {
      headers: withKey('dec'),
      data: { reason: 'Fin de vie', evidence: ['rapport-décommissionnement.pdf'] },
    });
    expect(decommissionResponse.ok()).toBeTruthy();
    expect((await decommissionResponse.json()).data.status).toBe('decommissioned');

    // --- Second actif pour inspection / transfert / disposition ---
    const secondAssetResponse = await request.post(`${API_URL}/facilities/assets`, {
      headers,
      data: { siteId: site.id, assetCode: `FAC2-${suffix}`, name: 'Chariot élévateur', assetType: 'vehicle', responsibleUserId: 1 },
    });
    expect(secondAssetResponse.ok()).toBeTruthy();
    const secondAsset = (await secondAssetResponse.json()).data;

    // --- Inspection : refus si date future, puis valide ---
    const badInspectionResponse = await request.post(`${API_URL}/facilities/inspections`, {
      headers: withKey('insp-bad'),
      data: { subjectType: 'asset', subjectId: secondAsset.id, inspectionNumber: `INS-${suffix}`, inspectedAt: '2027-01-01', inspectorUserId: 1 },
    });
    expect(badInspectionResponse.status()).toBe(409);

    const inspectionResponse = await request.post(`${API_URL}/facilities/inspections`, {
      headers: withKey('insp'),
      data: { subjectType: 'asset', subjectId: secondAsset.id, inspectionNumber: `INS-${suffix}`, inspectedAt: '2026-06-01', inspectorUserId: 1, findings: ['usure normale'], evidence: ['rapport-inspection.pdf'] },
    });
    expect(inspectionResponse.ok()).toBeTruthy();

    // --- Transfert accepté : refus si demandeur == accepteur, puis valide ---
    const badTransferResponse = await request.post(`${API_URL}/facilities/transfers`, {
      headers: withKey('tr-bad'),
      data: { subjectType: 'asset', subjectId: secondAsset.id, toSiteId: site.id, requestedByUserId: 1, acceptedByUserId: 1, reason: 'Réaffectation', status: 'accepted', evidence: ['bon-transfert.pdf'] },
    });
    expect(badTransferResponse.status()).toBe(409);

    const transferResponse = await request.post(`${API_URL}/facilities/transfers`, {
      headers: withKey('tr'),
      data: { subjectType: 'asset', subjectId: secondAsset.id, toSiteId: site.id, requestedByUserId: 1, acceptedByUserId: 2, reason: 'Réaffectation', status: 'accepted', evidence: ['bon-transfert.pdf'] },
    });
    expect(transferResponse.ok()).toBeTruthy();
    expect((await transferResponse.json()).data.status).toBe('accepted');

    // --- Disposition approuvée : refus si demandeur == approbateur, puis valide ---
    const badDisposalResponse = await request.post(`${API_URL}/facilities/disposals`, {
      headers: withKey('disp-bad'),
      data: { assetId: secondAsset.id, disposalMethod: 'sale', reason: 'Obsolète', requestedByUserId: 1, approvedByUserId: 1, status: 'approved', evidence: ['facture-vente.pdf'] },
    });
    expect(badDisposalResponse.status()).toBe(409);

    const disposalResponse = await request.post(`${API_URL}/facilities/disposals`, {
      headers: withKey('disp'),
      data: { assetId: secondAsset.id, disposalMethod: 'sale', reason: 'Obsolète', residualValue: 500, requestedByUserId: 1, approvedByUserId: 2, status: 'approved', evidence: ['facture-vente.pdf'] },
    });
    expect(disposalResponse.ok()).toBeTruthy();
    expect((await disposalResponse.json()).data.status).toBe('approved');

    // --- Listes et alertes ---
    const sitesListResponse = await request.get(`${API_URL}/facilities/sites`, { headers });
    expect(sitesListResponse.ok()).toBeTruthy();
    expect((await sitesListResponse.json()).data.some((s) => s.id === site.id)).toBe(true);

    const alertsResponse = await request.get(`${API_URL}/facilities/alerts`, { headers });
    expect(alertsResponse.ok()).toBeTruthy();
    expect(Array.isArray((await alertsResponse.json()).data)).toBe(true);
  });
});
