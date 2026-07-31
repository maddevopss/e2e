const { randomUUID } = require("crypto");

function makeTestPassword() {
  return process.env.E2E_SIGNUP_PASSWORD || `E2E-${randomUUID()}-aA1!`;
}

module.exports = {
  makeTestPassword,
};
