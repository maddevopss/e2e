const path = require("path");
const dotenv = require("dotenv");

// Charger .env.test
dotenv.config({
  path: path.resolve(__dirname, "../../backend/.env.test"),
  override: false,
});

const API_URL = process.env.TEST_API_URL || "http://127.0.0.1:5000";

/**
 * Helpers pour les dates ISO
 */
function todayISO() {
  const today = new Date();
  return today.toISOString().split('T')[0]; // YYYY-MM-DD
}

function plusDaysISO(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Unwrap API response data
 * Gère les structures : { success: true, data: {...} } ou { id: ..., ... }
 */
function unwrapApiData(payload, label) {
  if (!payload) {
    throw new Error(`${label}: payload is null or undefined`);
  }
  
  // Si la réponse a une structure { success, data: {...} }
  if (payload.data && typeof payload.data === "object") {
    return payload.data;
  }
  
  // Si c'est directement l'objet avec id
  if (payload.id) {
    return payload;
  }
  
  // Sinon, erreur
  throw new Error(`${label}: unable to unwrap response. Got: ${JSON.stringify(payload)}`);
}

/**
 * Helper pour POST API avec gestion d'erreur robuste
 */
async function apiPost(request, token, path, body) {
  // Vérifier que le token est valide
  if (!token || typeof token !== "string") {
    throw new Error(`apiPost: token missing or invalid. Got: ${typeof token}`);
  }
  
  console.log(`📤 POST ${path} with token length: ${token.length}`);
  
  const res = await request.post(`${API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: body,
  });

  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`POST ${path} failed: ${res.status()} ${text}`);
  }

  return res.json();
}

/**
 * Helper pour GET API
 */
async function apiGet(request, token, path) {
  const res = await request.get(`${API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`GET ${path} failed: ${res.status()} ${text}`);
  }

  return res.json();
}

/**
 * Créer un client
 */
async function createClient(request, token, data) {
  const response = await apiPost(request, token, "/api/clients", {
    nom: data.nom,
    hourly_rate_defaut: data.hourly_rate_defaut || 100,
    email: data.email || null,
    phone: data.phone || null,
    adresse: data.adresse || null,
    notes: data.notes || null,
  });
  const client = unwrapApiData(response, "createClient");
  if (!client.id) {
    throw new Error(`createClient: client.id is missing. Got: ${JSON.stringify(client)}`);
  }
  return client;
}

/**
 * Créer un projet
 */
async function createProject(request, token, data) {
  const response = await apiPost(request, token, "/api/projets", {
    client_id: data.client_id,
    nom: data.nom,
    description: data.description || null,
    taux_horaire: data.taux_horaire || 100,
    status: data.status || "actif",
    couleur: data.couleur || null,
  });
  const project = unwrapApiData(response, "createProject");
  if (!project.id) {
    throw new Error(`createProject: project.id is missing. Got: ${JSON.stringify(project)}`);
  }
  return project;
}

/**
 * Créer une entrée de temps manuelle
 */
async function createTimeEntry(request, token, data) {
  const response = await apiPost(request, token, "/api/timesheet/manual", {
    projet_id: data.projet_id,
    start_time: data.start_time,
    end_time: data.end_time,
    description: data.description || null,
  });
  const entry = unwrapApiData(response, "createTimeEntry");
  if (!entry.id) {
    throw new Error(`createTimeEntry: entry.id is missing. Got: ${JSON.stringify(entry)}`);
  }
  return entry;
}

/**
 * Créer une facture
 */
async function createInvoice(request, token, data) {
  const response = await apiPost(request, token, "/api/invoices", {
    client_id: data.client_id,
    time_entry_ids: data.time_entry_ids || [],
    expense_ids: data.expense_ids || [],
    tax_rate: data.tax_rate || 0,
    notes: data.notes || null,
    issue_date: data.issue_date || todayISO(),
    due_date: data.due_date || plusDaysISO(30),
  });
  const invoice = unwrapApiData(response, "createInvoice");
  if (!invoice.id) {
    throw new Error(`createInvoice: invoice.id is missing. Got: ${JSON.stringify(invoice)}`);
  }
  return invoice;
}

/**
 * Lister les clients
 */
async function listClients(request, token) {
  return apiGet(request, token, "/api/clients");
}

/**
 * Lister les projets
 */
async function listProjects(request, token) {
  return apiGet(request, token, "/api/projets");
}

/**
 * Lister les factures
 */
async function listInvoices(request, token) {
  return apiGet(request, token, "/api/invoices");
}

module.exports = {
  apiPost,
  apiGet,
  createClient,
  createProject,
  createTimeEntry,
  createInvoice,
  listClients,
  listProjects,
  listInvoices,
};
