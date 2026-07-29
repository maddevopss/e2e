const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const scenarioPath = path.join(root, 'tests', 'payroll-closure.spec.js');
const errors = [];

if (!fs.existsSync(scenarioPath)) {
  errors.push('Le scénario tests/payroll-closure.spec.js est absent.');
} else {
  const scenario = fs.readFileSync(scenarioPath, 'utf8');
  const requiredFragments = [
    '/api/payroll/employees',
    '/api/payroll/periods',
    '/api/payroll/runs',
    '/api/payroll/remittances/deposits',
    '/api/payroll/remittances/vacations',
    '/api/payroll/remittances/terminations',
    '/api/payroll/remittances/year-end-slips',
    '/api/payroll/remittances/reconciliation',
    'E2E_PAYROLL_TOKEN_A',
    'E2E_PAYROLL_TOKEN_B',
    'idsA',
  ];
  for (const fragment of requiredFragments) {
    if (!scenario.includes(fragment)) errors.push(`Étape de paie contractuelle absente: ${fragment}`);
  }
}

const command = packageJson.scripts?.['test:payroll-closure'];
if (!command || !command.includes('tests/payroll-closure.spec.js') || !command.includes('--workers=1')) {
  errors.push('Le script test:payroll-closure doit cibler le scénario Paie avec un seul worker.');
}

if (errors.length) {
  console.error('Payroll closure contract failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Payroll closure contract passed.');
