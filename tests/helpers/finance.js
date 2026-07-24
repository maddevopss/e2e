const crypto = require('crypto');
const { execFileSync } = require('child_process');

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function queryScalar(sql) {
  if (!databaseUrl) throw new Error('TEST_DATABASE_URL ou DATABASE_URL est requis.');
  return execFileSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', sql], { encoding: 'utf8' }).trim();
}

function stripeSignature(payload, timestamp = Math.floor(Date.now() / 1000)) {
  if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET est requis.');
  const digest = crypto.createHmac('sha256', webhookSecret).update(`${timestamp}.${payload}`, 'utf8').digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

module.exports = {
  queryScalar,
  sqlLiteral,
  stripeSignature,
};
