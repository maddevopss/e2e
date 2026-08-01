const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const scenarioPath = path.join(root, 'tests', 'accounting-revenue-cycle-closure.spec.js');
const errors = [];

if (!fs.existsSync(scenarioPath)) {
  errors.push('Le scénario tests/accounting-revenue-cycle-closure.spec.js est absent.');
} else {
  const scenario = fs.readFileSync(scenarioPath, 'utf8');
  const requiredFragments = [
    '/accounts/seed',
    '/clients',
    '/projets',
    '/expenses',
    '/invoices',
    '/finalize',
    "sentInvoice.status).toBe('sent')",
    '/invoice-payments/invoices/',
    "invoiceAfterPayment.status).toBe('paid')",
    "source_type === 'invoice'",
    "source_type === 'invoice_payment'",
    'balanced: true',
    'isBalanced',
    'incomeStatement.revenue',
    'tenantBContext',
    "expect(forbiddenInvoice.status()).toBe(404)",
  ];
  for (const fragment of requiredFragments) {
    if (!scenario.includes(fragment)) errors.push(`Étape du cycle revenu contractuelle absente: ${fragment}`);
  }
}

const command = packageJson.scripts?.['test:accounting-revenue-cycle-closure'];
if (!command || !command.includes('tests/accounting-revenue-cycle-closure.spec.js') || !command.includes('--workers=1')) {
  errors.push('Le script test:accounting-revenue-cycle-closure doit cibler le scénario avec un seul worker.');
}

if (errors.length) {
  console.error('Accounting revenue cycle closure contract failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Accounting revenue cycle closure contract passed.');
