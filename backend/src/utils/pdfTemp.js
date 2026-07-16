const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

function randomTempBase(randomUUID = crypto.randomUUID) {
  return `document-${randomUUID()}`;
}

async function withPdfTempDir(operation, options = {}) {
  const fsApi = options.fsApi || fs;
  const tmpRoot = options.tmpRoot || os.tmpdir();
  const prefix = path.join(tmpRoot, 'cap-prenatal-pdf-');
  const tempDir = fsApi.mkdtempSync(prefix);

  try {
    return await operation(tempDir);
  } finally {
    fsApi.rmSync(tempDir, { recursive: true, force: true });
  }
}

module.exports = {
  randomTempBase,
  withPdfTempDir,
};
