'use strict';

const REQUIRED_SUITES = Object.freeze([
  'authentication',
  'multi_organisation_isolation',
  'clients_projects_time',
  'quotes_invoices_payments',
  'accounting',
  'payroll',
  'inventory',
  'suppliers_procurement',
  'decision_dashboard',
  'public_portals',
  'frontend_responsive_accessibility',
  'desktop_agent_contract',
  'recovery_and_observability'
]);

function evaluateE2EV1Certification(evidence = {}) {
  const suites = evidence.suites || {};
  const missing = REQUIRED_SUITES.filter((suite) => suites[suite] !== 'passed');
  const sourceCommits = evidence.sourceCommits || {};

  for (const repo of ['backend', 'frontend', 'desktopAgent', 'e2e']) {
    if (!String(sourceCommits[repo] || '').trim()) missing.push(`source_commit_${repo}`);
  }

  if (!String(evidence.environment || '').trim()) missing.push('environment');
  if (!String(evidence.approvedBy || '').trim()) missing.push('approved_by');

  return Object.freeze({
    certified: missing.length === 0,
    status: missing.length === 0 ? 'certified' : 'blocked',
    missing: Object.freeze([...new Set(missing)]),
    evaluatedAt: new Date().toISOString()
  });
}

module.exports = { REQUIRED_SUITES, evaluateE2EV1Certification };
