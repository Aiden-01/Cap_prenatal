const pool = require('./pool');

const REQUIRED_MIGRATION = '008_retirar_referencias_efectuadas.sql';

class SchemaCompatibilityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SchemaCompatibilityError';
    this.code = 'SCHEMA_MIGRATION_REQUIRED';
  }
}

async function assertSchemaCompatible(db = pool) {
  const { rows: relationRows } = await db.query(
    "SELECT to_regclass('public.schema_migrations') AS migration_registry"
  );
  const relations = relationRows[0] || {};

  if (relations.migration_registry === null) {
    throw new SchemaCompatibilityError(
      'El backend requiere el registro de migraciones y la migracion 008. No se iniciara el servidor.'
    );
  }

  const { rows: migrationRows } = await db.query(
    'SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE filename = $1) AS applied',
    [REQUIRED_MIGRATION]
  );
  if (migrationRows[0]?.applied !== true) {
    throw new SchemaCompatibilityError(
      'El backend requiere que la migracion 008 este aplicada. No se iniciara el servidor.'
    );
  }
}

module.exports = {
  REQUIRED_MIGRATION,
  SchemaCompatibilityError,
  assertSchemaCompatible,
};
