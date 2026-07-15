const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const {
  ConfigError,
  validateAppConfig,
  validateDatabaseConfig,
  validateJwtConfig,
} = require('../src/config/env');

const ROOT = path.resolve(__dirname, '../..');

function developmentEnv(overrides = {}) {
  return {
    NODE_ENV: 'development',
    JWT_SECRET: 'qN4v8xR2mK7pT9zW3cF6hJ1sL5yB0dG4',
    JWT_EXPIRES_IN: '8h',
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_NAME: 'cap_prenatal',
    DB_USER: 'cap_app',
    DB_PASSWORD: 'local-db-test-value',
    DB_SSL: 'false',
    DB_SSL_REJECT_UNAUTHORIZED: 'false',
    FRONTEND_URL: 'http://localhost:5173',
    COOKIE_SAMESITE: 'lax',
    ...overrides,
  };
}

function productionEnv(overrides = {}) {
  return developmentEnv({
    NODE_ENV: 'production',
    JWT_SECRET: '7mQ2vR9xK4pT8zN3cF6hJ1sL5yB0dG7wE2uA9iP4',
    DB_PASSWORD: '8vR2!mK7#pT9$zW3',
    DB_SSL: 'true',
    DB_SSL_REJECT_UNAUTHORIZED: 'true',
    FRONTEND_URL: 'https://app.cap.test',
    ...overrides,
  });
}

test('NODE_ENV ausente impide cargar la configuracion completa', () => {
  const env = developmentEnv();
  delete env.NODE_ENV;
  assert.throws(
    () => validateAppConfig(env),
    (error) => error instanceof ConfigError && error.variable === 'NODE_ENV'
  );
});

test('el entrypoint falla de forma controlada antes de cargar rutas', () => {
  const result = spawnSync(process.execPath, ['src/index.js'], {
    cwd: path.join(ROOT, 'backend'),
    env: { ...process.env, ...developmentEnv({ JWT_SECRET: '' }) },
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^Configuracion invalida: JWT_SECRET\s*$/);
});

test('JWT_SECRET ausente produce un error controlado', () => {
  const env = developmentEnv();
  delete env.JWT_SECRET;
  assert.throws(
    () => validateJwtConfig(env),
    (error) => error instanceof ConfigError && error.variable === 'JWT_SECRET'
  );
});

test('JWT_SECRET vacio se rechaza', () => {
  assert.throws(
    () => validateJwtConfig(developmentEnv({ JWT_SECRET: '   ' })),
    (error) => error instanceof ConfigError && error.variable === 'JWT_SECRET'
  );
});

test('JWT_SECRET demasiado corto se rechaza', () => {
  assert.throws(
    () => validateJwtConfig(developmentEnv({ JWT_SECRET: 'short-test-value' })),
    (error) => error instanceof ConfigError && error.variable === 'JWT_SECRET'
  );
});

test('produccion rechaza un JWT_SECRET marcado como ejemplo o desarrollo', () => {
  assert.throws(
    () => validateJwtConfig(productionEnv({
      JWT_SECRET: `development-${'x'.repeat(40)}`,
    })),
    (error) => error instanceof ConfigError && error.variable === 'JWT_SECRET'
  );
});

test('produccion rechaza un JWT_SECRET largo pero obviamente repetitivo', () => {
  assert.throws(
    () => validateJwtConfig(productionEnv({ JWT_SECRET: 'ab'.repeat(32) })),
    (error) => error instanceof ConfigError && error.variable === 'JWT_SECRET'
  );
});

test('una configuracion valida de produccion es aceptada', () => {
  const config = validateAppConfig(productionEnv());
  assert.equal(config.nodeEnv, 'production');
  assert.equal(config.database.ssl.rejectUnauthorized, true);
  assert.deepEqual(config.frontendOrigins, ['https://app.cap.test']);
});

test('los errores no incluyen el secreto rechazado', () => {
  const rejectedValue = `example-${'q'.repeat(40)}`;
  let captured;
  try {
    validateJwtConfig(productionEnv({ JWT_SECRET: rejectedValue }));
  } catch (error) {
    captured = error;
  }
  assert.ok(captured instanceof ConfigError);
  assert.equal(captured.message, 'Configuracion invalida: JWT_SECRET');
  assert.equal(captured.message.includes(rejectedValue), false);
});

test('configuracion PostgreSQL incompleta produce un error controlado', () => {
  const env = developmentEnv();
  delete env.DB_HOST;
  assert.throws(
    () => validateDatabaseConfig(env),
    (error) => error instanceof ConfigError && error.variable === 'DB_HOST'
  );
});

test('DB_SSL ausente o ambiguo se rechaza', () => {
  const missing = developmentEnv();
  delete missing.DB_SSL;
  assert.throws(
    () => validateDatabaseConfig(missing),
    (error) => error instanceof ConfigError && error.variable === 'DB_SSL'
  );
  assert.throws(
    () => validateDatabaseConfig(developmentEnv({ DB_SSL: 'yes' })),
    (error) => error instanceof ConfigError && error.variable === 'DB_SSL'
  );
});

test('produccion rechaza una contrasena PostgreSQL predecible aunque sea larga', () => {
  assert.throws(
    () => validateDatabaseConfig(productionEnv({
      DB_PASSWORD: 'development-db-password-very-long',
    })),
    (error) => error instanceof ConfigError && error.variable === 'DB_PASSWORD'
  );
});

test('DATABASE_URL sigue siendo compatible sin variables DB separadas', () => {
  const env = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://cap_app:local-db-test-value@localhost:5432/cap_prenatal',
    DB_SSL: 'false',
  };
  const config = validateDatabaseConfig(env);
  assert.equal(config.connectionString, env.DATABASE_URL);
  assert.equal(config.ssl, false);
});

test('DATABASE_URL mal formada no expone errores internos de decodificacion', () => {
  assert.throws(
    () => validateDatabaseConfig({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://cap_app:%ZZ@localhost:5432/cap_prenatal',
      DB_SSL: 'false',
    }),
    (error) => error instanceof ConfigError && error.variable === 'DATABASE_URL'
  );
});

test('produccion acepta HTTPS con DNS publico, DNS interno e IP privada', () => {
  const accepted = [
    'https://cap-prenatal.interno',
    'https://cap-prenatal.elchal.local',
    'https://10.0.0.25',
    'https://sistema.ejemplo.gob.gt',
  ];

  for (const origin of accepted) {
    const config = validateAppConfig(productionEnv({ FRONTEND_URL: origin }));
    assert.deepEqual(config.frontendOrigins, [origin]);
  }
});

test('produccion rechaza HTTP, loopback, credenciales, rutas, query y comodines', () => {
  const rejected = [
    'http://cap-prenatal.interno',
    'http://localhost:5173',
    'https://localhost',
    'https://127.0.0.1',
    'https://[::1]',
    'https://usuario:clave@servidor',
    'https://servidor/app',
    'https://servidor?origen=otro',
    'https://servidor#fragmento',
    '*',
    'https://*.interno',
  ];

  for (const origin of rejected) {
    assert.throws(
      () => validateAppConfig(productionEnv({ FRONTEND_URL: origin })),
      (error) => error instanceof ConfigError && error.variable === 'FRONTEND_URL',
      origin
    );
  }
});

test('CORS conserva origen exacto y no agrega origenes de desarrollo en produccion', () => {
  const config = validateAppConfig(productionEnv({
    FRONTEND_URL: 'https://10.0.0.25,https://cap-prenatal.interno/',
  }));
  assert.deepEqual(config.frontendOrigins, [
    'https://10.0.0.25',
    'https://cap-prenatal.interno',
  ]);

  const source = fs.readFileSync(path.join(ROOT, 'backend', 'src', 'index.js'), 'utf8');
  assert.match(source, /if \(config\.nodeEnv === 'production'\) return false;/);
  assert.match(source, /allowedOrigins\.includes\(origin\) \|\| isAllowedDevOrigin\(origin\)/);
});

test('COOKIE_SAMESITE solo acepta valores conocidos', () => {
  assert.throws(
    () => validateAppConfig(developmentEnv({ COOKIE_SAMESITE: 'invalid' })),
    (error) => error instanceof ConfigError && error.variable === 'COOKIE_SAMESITE'
  );
});

test('produccion rechaza AUTOMATION_SECRET de ejemplo cuando se habilita', () => {
  assert.throws(
    () => validateAppConfig(productionEnv({
      AUTOMATION_SECRET: `example-${'a'.repeat(40)}`,
    })),
    (error) => error instanceof ConfigError && error.variable === 'AUTOMATION_SECRET'
  );
});

test('Docker Compose exige secretos externos y no contiene defaults utilizables', () => {
  const source = fs.readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf8');
  const jwtLines = source.split(/\r?\n/).filter((line) => /^\s*JWT_SECRET:/.test(line));
  const dbPasswordLines = source.split(/\r?\n/).filter((line) => /^\s*(?:POSTGRES_PASSWORD|DB_PASSWORD):/.test(line));
  const automationLines = source.split(/\r?\n/).filter((line) => /^\s*AUTOMATION_SECRET:/.test(line));

  assert.ok(jwtLines.length > 0);
  assert.ok(dbPasswordLines.length > 0);
  assert.ok(automationLines.length > 0);
  for (const line of [...jwtLines, ...dbPasswordLines, ...automationLines]) {
    assert.match(line, /\$\{[A-Z_]+:\?/);
  }
  assert.match(source, /ENTORNO DE DESARROLLO LOCAL EXCLUSIVAMENTE/);
  assert.match(source, /NODE_ENV:\s*development/);
});

test('archivos env de ejemplo dejan vacios todos los secretos', () => {
  const files = [
    path.join(ROOT, '.env.example'),
    path.join(ROOT, 'backend', '.env.example'),
  ];
  const secretNames = new Set([
    'POSTGRES_PASSWORD',
    'DB_PASSWORD',
    'JWT_SECRET',
    'AUTOMATION_SECRET',
    'SEED_DIRECTOR_PASSWORD',
  ]);

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const line of source.split(/\r?\n/)) {
      if (line.trimStart().startsWith('#')) continue;
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && secretNames.has(match[1])) assert.equal(match[2], '', `${file}: ${match[1]}`);
    }
  }
});

test('documentacion no conserva formatos de contrasenas iniciales ni placeholders antiguos', () => {
  const documentationFiles = [
    path.join(ROOT, 'README.md'),
    path.join(ROOT, 'DOCKER.md'),
    path.join(ROOT, 'backend', 'src', 'AUDITORIA.md'),
    ...fs.readdirSync(path.join(ROOT, 'docs'))
      .filter((name) => /\.(?:md|txt)$/i.test(name))
      .map((name) => path.join(ROOT, 'docs', name)),
  ];
  const prohibited = [
    /(?:Admin|Director|Personal)\d{4}\*/i,
    new RegExp(['change', 'me', 'to', 'a', 'long', 'random'].join('_'), 'i'),
    new RegExp(['cap', 'el', 'chal', 'jwt', 'secret', 'local'].join('_'), 'i'),
    /CAMBIAR_POR_(?:SECRETO|CLAVE)/i,
  ];

  for (const file of documentationFiles) {
    const source = fs.readFileSync(file, 'utf8');
    for (const pattern of prohibited) {
      assert.doesNotMatch(source, pattern, file);
    }
  }
});
