const crypto = require('crypto');

function normalizeLineEndings(sql) {
  return sql.replace(/\r\n?/g, '\n');
}

function hashMigrationContent(sql) {
  return crypto.createHash('sha256').update(sql, 'utf8').digest('hex');
}

function calculateMigrationChecksum(sql) {
  return hashMigrationContent(normalizeLineEndings(sql));
}

function getCompatibleMigrationChecksums(sql) {
  const canonicalSql = normalizeLineEndings(sql);
  const crlfSql = canonicalSql.replace(/\n/g, '\r\n');

  return new Set([
    hashMigrationContent(sql),
    hashMigrationContent(canonicalSql),
    hashMigrationContent(crlfSql),
  ]);
}

function isMigrationChecksumCompatible(storedChecksum, sql) {
  return typeof storedChecksum === 'string'
    && getCompatibleMigrationChecksums(sql).has(storedChecksum);
}

module.exports = {
  calculateMigrationChecksum,
  getCompatibleMigrationChecksums,
  isMigrationChecksumCompatible,
  normalizeLineEndings,
};
