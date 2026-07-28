const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const scenarioPath = path.join(root, 'tests', 'accounting-closure.spec.js');
const errors = [];

if (!fs.existsSync(scenarioPath)) {
  errors.push('Le scénario tests/accounting-closure.spec.js est absent.');
} else {
  const scenario = fs.readFileSync(scenarioPath, 'utf8');
  const requiredFragments = [
    '/accounts/seed',
    '/periods',
    '/entries',
    '/post',
    '/ledger?',
    '/trial-balance?',
    '/statements?',
    '/exports/trial-balance.csv?',
    '/exports/journal.csv?',
    '/reverse',
    '/close',
    '/reopen',
    'tenantBContext',
    'expect(forbiddenDetail.status()).toBe(404)',
  ];

  for (const fragment of requiredFragments) {
    if (!scenario.includes(fragment)) {
      errors.push(`Étape comptable contractuelle absente du scénario: ${fragment}`);
    }
  }

  const amounts = scenario.match(/125\.5/g) || [];
  if (amounts.length < 4) {
    errors.push('Le scénario ne conserve plus une preuve monétaire équilibrée de 125,50 $.');
  }
}

const closureScript = packageJson.scripts?.['test:accounting-closure'];
if (!closureScript || !closureScript.includes('tests/accounting-closure.spec.js') || !closureScript.includes('--workers=1')) {
  errors.push('Le script test:accounting-closure doit cibler le scénario comptable avec un seul worker.');
}

if (errors.length) {
  console.error('Accounting closure contract failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Accounting closure contract passed.');
