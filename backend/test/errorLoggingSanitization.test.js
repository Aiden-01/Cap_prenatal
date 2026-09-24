const assert = require('node:assert/strict');
const test = require('node:test');

const { errorHandler } = require('../src/middleware/errorHandler');
const { AppError } = require('../src/utils/appError');
const { diagnosticCode } = require('../src/utils/safeErrorLog');

test('codigo diagnostico solo acepta identificadores tecnicos acotados', () => {
  assert.equal(diagnosticCode({ code: '23505' }), '23505');
  assert.equal(diagnosticCode({ code: 'ECONNRESET' }), 'ECONNRESET');
  assert.equal(diagnosticCode({ code: 'TOKEN_fake-secret' }), 'UNKNOWN_ERROR');
  assert.equal(diagnosticCode({ code: 'SQL_PRIVATE_1234567890101' }), 'UNKNOWN_ERROR');
});

function capture(error, route = '/:id') {
  const logs = [];
  const original = console.error;
  const res = {
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return value; },
  };
  console.error = (...args) => logs.push(args);
  try {
    errorHandler(error, {
      method: 'GET',
      path: '/patients/1234567890101',
      route: { path: route },
    }, res, () => {});
  } finally {
    console.error = original;
  }
  return { logs, res };
}

test('el log estructurado omite mensajes, trazas y rutas con datos simulados', () => {
  const samples = [
    'Bearer fake-token-abc123',
    'password=synthetic-password',
    'CUI 1234567890101',
    'diagnostico: dato clinico sintetico',
    'SELECT * FROM pacientes WHERE cui=1234567890101',
    'C:\\private\\internal\\file.pdf',
  ];
  for (const secret of samples) {
    const error = new Error(secret);
    error.code = 'XX000';
    error.constraint = secret;
    const { logs, res } = capture(error);
    const serialized = JSON.stringify(logs);
    assert.doesNotMatch(serialized, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(logs[0][1].path, '/:id');
    assert.equal(logs[0][1].status, 500);
    assert.equal(res.body.code, 'INTERNAL_SERVER_ERROR');
    assert.equal(res.body.message, 'Error interno del servidor');
    assert.equal(Object.hasOwn(res.body, 'debug'), false);
  }
});

test('mensajes operativos normales mantienen status y codigo sin registrar texto arbitrario', () => {
  const { logs, res } = capture(new AppError(400, 'Datos de entrada invalidos', {
    code: 'VALIDATION_ERROR',
  }));
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'Datos de entrada invalidos');
  assert.equal(res.body.code, 'VALIDATION_ERROR');
  assert.equal(logs[0][1].message, 'Datos de entrada invalidos');
});
