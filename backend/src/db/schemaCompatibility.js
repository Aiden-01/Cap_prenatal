const fs = require('fs');
const pool = require('./pool');
const {
  DEFAULT_MIGRATIONS_DIR,
  discoverMigrationFiles,
} = require('./migrate');
const {
  calculateMigrationChecksum,
  isMigrationChecksumCompatible,
} = require('./migrationChecksum');

const REQUIRED_MIGRATIONS = Object.freeze([
  '008_retirar_referencias_efectuadas.sql',
  '009_vax2_reglas_vacunas.sql',
  '010_vax31_historias_parciales.sql',
  '011_vax4_influenza_aplicaciones_independientes.sql',
  '012_vax5_correccion_final.sql',
  '013_plan_parto_horas_decimales.sql',
]);
const REQUIRED_MIGRATION = REQUIRED_MIGRATIONS[0];
const MIGRATION_COMMAND = 'npm run db:migrate';

class SchemaCompatibilityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SchemaCompatibilityError';
    this.code = 'SCHEMA_MIGRATION_REQUIRED';
  }
}

function loadRequiredMigrations({
  migrationsDir = DEFAULT_MIGRATIONS_DIR,
  readDirectory = fs.readdirSync,
  readMigration = fs.readFileSync,
} = {}) {
  const discovered = new Map(
    discoverMigrationFiles({ migrationsDir, readDirectory })
      .map((migration) => [migration.filename, migration])
  );
  const missingFiles = REQUIRED_MIGRATIONS.filter((filename) => !discovered.has(filename));

  if (missingFiles.length > 0) {
    throw new SchemaCompatibilityError(
      `El despliegue no incluye migraciones requeridas: ${missingFiles.join(', ')}.`
    );
  }

  return REQUIRED_MIGRATIONS.map((filename) => {
    const migration = discovered.get(filename);
    const sql = readMigration(migration.path, 'utf8');
    return {
      filename,
      checksum: calculateMigrationChecksum(sql),
      sql,
    };
  });
}

function migrationInstruction(message) {
  return `${message} Ejecute el flujo oficial con "${MIGRATION_COMMAND}" antes de iniciar el servidor.`;
}

async function queryMigrationRegistry(db, requiredMigrations) {
  try {
    const { rows: relationRows = [] } = await db.query(
      "SELECT to_regclass('public.schema_migrations') AS migration_registry"
    );
    if (relationRows[0]?.migration_registry === null) {
      throw new SchemaCompatibilityError(migrationInstruction(
        'El backend requiere el registro schema_migrations y las migraciones 008 a 013.'
      ));
    }

    const filenames = requiredMigrations.map(({ filename }) => filename);
    const { rows = [] } = await db.query(
      `SELECT filename, checksum
       FROM schema_migrations
       WHERE filename = ANY($1::text[])`,
      [filenames]
    );
    return rows;
  } catch (error) {
    if (error instanceof SchemaCompatibilityError) throw error;
    throw new SchemaCompatibilityError(migrationInstruction(
      'No se pudo validar un registro schema_migrations compatible.'
    ));
  }
}

async function assertSchemaCompatible(
  db = pool,
  { requiredMigrations = loadRequiredMigrations() } = {}
) {
  const migrationRows = await queryMigrationRegistry(db, requiredMigrations);
  const appliedMigrations = new Map();
  let registryIsCompatible = true;

  for (const row of migrationRows) {
    if (
      typeof row.filename !== 'string'
      || typeof row.checksum !== 'string'
      || appliedMigrations.has(row.filename)
    ) {
      registryIsCompatible = false;
      continue;
    }
    appliedMigrations.set(row.filename, row.checksum);
  }

  const pendingOrModified = requiredMigrations
    .filter(({ filename, checksum: expectedChecksum, sql }) => {
      const storedChecksum = appliedMigrations.get(filename);
      return typeof sql === 'string'
        ? !isMigrationChecksumCompatible(storedChecksum, sql)
        : storedChecksum !== expectedChecksum;
    })
    .map(({ filename }) => filename);

  if (!registryIsCompatible || pendingOrModified.length > 0) {
    const detail = pendingOrModified.length > 0
      ? `Migraciones pendientes o incompatibles: ${pendingOrModified.join(', ')}.`
      : 'El registro schema_migrations es incompatible.';
    throw new SchemaCompatibilityError(migrationInstruction(
      `El backend requiere las migraciones 008 a 013 aplicadas con su checksum versionado. ${detail}`
    ));
  }
}

module.exports = {
  MIGRATION_COMMAND,
  REQUIRED_MIGRATION,
  REQUIRED_MIGRATIONS,
  SchemaCompatibilityError,
  assertSchemaCompatible,
  loadRequiredMigrations,
};
