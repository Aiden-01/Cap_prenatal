const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const jwt = require('jsonwebtoken');

const { authMiddleware } = require('../src/middleware/auth');
const { verificarPermiso } = require('../src/middleware/permisos');

function invoke(middleware, req) {
  return new Promise((resolve, reject) => {
    try {
      middleware(req, {}, (error) => {
        if (error) reject(error);
        else resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function runAuthorizationChain({ permisos, permisoRequerido }) {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = '7mQ2vR9xK4pT8zN3cF6hJ1sL5yB0dG7wE2';
  const token = jwt.sign(
    { id: 99, username: 'test-user', rol: 'personal_salud' },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );
  const req = { headers: { authorization: `Bearer ${token}` } };
  let controllerReached = false;

  try {
    await invoke(authMiddleware, req);
    req.usuario.permisos = permisos;
    await invoke(verificarPermiso(permisoRequerido), req);
    controllerReached = true;
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }

  return controllerReached;
}

test('usuario no autenticado recibe 401', async () => {
  await assert.rejects(
    invoke(authMiddleware, { headers: {} }),
    (error) => error.statusCode === 401 && error.code === 'TOKEN_REQUIRED'
  );
});

test('usuario autenticado sin permiso recibe 403', async () => {
  await assert.rejects(
    runAuthorizationChain({ permisos: [], permisoRequerido: 'pacientes.ver' }),
    (error) => error.statusCode === 403 && error.code === 'PERMISO_REQUERIDO'
  );
});

test('usuario autenticado con permiso llega al controlador', async () => {
  const reached = await runAuthorizationChain({
    permisos: ['pacientes.ver'],
    permisoRequerido: 'pacientes.ver',
  });
  assert.equal(reached, true);
});

test('usuario con permiso de creacion conserva acceso a una escritura', async () => {
  const reached = await runAuthorizationChain({
    permisos: ['controles.crear'],
    permisoRequerido: 'controles.crear',
  });
  assert.equal(reached, true);
});

test('embarazo cerrado continua rechazando escrituras', async () => {
  const poolPath = require.resolve('../src/db/pool');
  const embarazosPath = require.resolve('../src/utils/embarazos');
  const previousPool = require.cache[poolPath];
  const previousEmbarazos = require.cache[embarazosPath];

  require.cache[poolPath] = {
    id: poolPath,
    filename: poolPath,
    loaded: true,
    exports: {
      query: async () => ({
        rows: [{ id: 7, paciente_id: 42, estado: 'cerrado' }],
      }),
    },
  };
  delete require.cache[embarazosPath];

  try {
    const { validarEmbarazoEditable } = require('../src/utils/embarazos');
    await assert.rejects(
      validarEmbarazoEditable({ pacienteId: 42, embarazoId: 7 }),
      (error) => error.statusCode === 409 && error.code === 'PREGNANCY_READ_ONLY'
    );
  } finally {
    if (previousPool) require.cache[poolPath] = previousPool;
    else delete require.cache[poolPath];
    if (previousEmbarazos) require.cache[embarazosPath] = previousEmbarazos;
    else delete require.cache[embarazosPath];
  }
});

const routeContracts = {
  'riesgo.js': [
    ["router.get('/', verificarPermiso('pacientes.ver')"],
    ["router.post('/', verificarPermiso('controles.crear')"],
    ["router.put('/', verificarPermiso('controles.editar')"],
    ["router.delete('/', verificarPermiso('controles.editar')"],
  ],
  'vacunas.js': [
    ["router.get('/',       verificarPermiso('pacientes.ver')"],
    ["router.post('/',      verificarPermiso('controles.crear')"],
    ["router.get('/antecedentes', verificarPermiso('pacientes.ver')"],
    ["router.get('/:id',    verificarPermiso('pacientes.ver')"],
    ["router.put('/:id',    verificarPermiso('controles.editar')"],
    ["router.delete('/:id', verificarPermiso('controles.editar')"],
  ],
  'morbilidad.js': [
    ["router.get('/',      verificarPermiso('pacientes.ver')"],
    ["router.post('/',     verificarPermiso('controles.crear')"],
    ["router.get('/:id',   verificarPermiso('pacientes.ver')"],
    ["router.put('/:id',   verificarPermiso('controles.editar')"],
    ["router.delete('/:id',verificarPermiso('controles.editar')"],
  ],
  'referencias.js': [
    ["router.get('/',       verificarPermiso('pacientes.ver')"],
    ["router.post('/',      verificarPermiso('controles.crear')"],
    ["router.put('/:id',    verificarPermiso('controles.editar')"],
    ["router.delete('/:id', verificarPermiso('controles.editar')"],
  ],
};

for (const [file, expectations] of Object.entries(routeContracts)) {
  test(`${file} declara permisos para todas sus rutas`, () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/routes', file), 'utf8');
    for (const [expected] of expectations) {
      assert.ok(source.includes(expected), `Falta contrato de autorizacion: ${expected}`);
    }
  });
}

test('plan de parto y puerperio protegen lectura, upsert y cambios', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/routes/controles.js'),
    'utf8'
  );

  assert.ok(source.includes("router.get('/plan-parto', verificarPermiso('pacientes.ver')"));
  assert.match(
    source,
    /'\/plan-parto',[\s\S]*?verificarPermiso\('controles\.crear'\),[\s\S]*?verificarPermiso\('controles\.editar'\)/
  );
  assert.ok(source.includes("router.get('/puerperio',        verificarPermiso('pacientes.ver')"));
  assert.match(
    source,
    /'\/puerperio',[\s\S]*?verificarPermiso\('controles\.crear'\),[\s\S]*?verificarPermiso\('controles\.editar'\)/
  );
  assert.ok(source.includes("router.get('/puerperio/:id',    verificarPermiso('pacientes.ver')"));
  assert.ok(source.includes("router.put('/puerperio/:id',    verificarPermiso('controles.editar')"));
  assert.ok(source.includes("router.delete('/puerperio/:id', verificarPermiso('controles.editar')"));
});
