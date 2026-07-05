const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const content = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');

const requiredRules = [
  'node_modules/',
  '.env',
  'playwright-report/',
  'test-results/',
  'storageState/*.json',
];

const lines = content.split(/\r?\n/);
const missing = requiredRules.filter((rule) => !lines.includes(rule));

if (missing.length) {
  console.error('\nMADSuite E2E .gitignore policy failed.\n');
  missing.forEach((rule) => console.error(`- missing: ${rule}`));
  process.exit(1);
}

console.log('E2E .gitignore policy passed.');
