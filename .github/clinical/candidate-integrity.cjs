'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const approvedCss = 'frontend/src/index.css';
// PREDEPLOY-03: única diferencia productiva propuesta para revisión del propietario.
const approvedHash = '9b6d24a932331046de714e25fdcdac26d82368c813bcd2a7033f0e2a6dbd7509';

function verifyReviewedLayout(paths, content) {
  assert.deepEqual(paths, [approvedCss], 'Unexpected frontend candidate changes');
  const sha256 = crypto.createHash('sha256').update(content.replace(/\r\n/g, '\n')).digest('hex');
  assert.equal(sha256, approvedHash, 'Frontend layout does not match reviewed PREDEPLOY-03 content');
  return { file: approvedCss, sha256 };
}

module.exports = { verifyReviewedLayout };
