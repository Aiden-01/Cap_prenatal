#!/usr/bin/env node

const { Pool } = require('pg');

const {
  loadEnvironmentFile,
  nodeEnvForValidation,
  validateDatabaseConfig,
} = require('../src/config/env');
const {
  DEFAULT_TABLE,
  parseAuditHistoryArguments,
  runAuditHistoryMigration,
} = require('../src/services/audit/auditHistoryMigration');

async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseAuditHistoryArguments(argv);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      categoria: error.code || 'ARGUMENT_VALIDATION_FAILED',
      etapa: error.stage || 'argument_validation',
      conteos: error.counts || {},
    })}\n`);
    process.exitCode = 1;
    return;
  }

  loadEnvironmentFile();
  const nodeEnv = nodeEnvForValidation(process.env);
  const pool = new Pool(validateDatabaseConfig(process.env, { nodeEnv }));
  let client;
  try {
    client = await pool.connect();
    const result = await runAuditHistoryMigration({
      client,
      ...options,
      tableName: DEFAULT_TABLE,
    });
    process.stdout.write(`${JSON.stringify(result.statistics, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      categoria: error.code || 'AUDIT_HISTORY_MIGRATION_FAILED',
      etapa: error.stage || 'unknown',
      conteos: error.counts || {},
    })}\n`);
    process.exitCode = 1;
  } finally {
    client?.release();
    await pool.end();
  }
}

if (require.main === module) main();

module.exports = { main };
