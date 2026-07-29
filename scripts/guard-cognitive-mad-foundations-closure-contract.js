const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const scenarioPath = path.join(root, 'tests', 'cognitive-mad-foundations-closure.spec.js');
const errors = [];

if (!fs.existsSync(scenarioPath)) {
  errors.push('Le scénario de fermeture cognitive et MAD est absent.');
} else {
  const scenario = fs.readFileSync(scenarioPath, 'utf8');
  const requiredFragments = [
    '/continuity',
    '/mad-foundation',
    'work_context_saved',
    'Objectif courant',
    'Prochaine action',
    'accepted',
    'Comprendre avant d’agir',
    'Prouver ce qui s’est passé',
    'Garder l’humain responsable',
    'la responsabilité finale demeure humaine',
  ];
  for (const fragment of requiredFragments) {
    if (!scenario.includes(fragment)) errors.push(`Preuve contractuelle absente: ${fragment}`);
  }
}

const testScript = packageJson.scripts?.['test:cognitive-mad-foundations-closure'];
if (!testScript || !testScript.includes('cognitive-mad-foundations-closure.spec.js') || !testScript.includes('--workers=1')) {
  errors.push('Le script de fermeture doit cibler le scénario avec un seul worker.');
}

if (errors.length) {
  console.error('Cognitive and MAD foundations closure contract failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Cognitive and MAD foundations closure contract passed.');
