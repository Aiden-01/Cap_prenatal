const test = require('node:test');
const assert = require('node:assert/strict');
const { usuarioCreateSchema, usuarioUpdateSchema } = require('../src/validations/usuarios.schemas');
const service = require('../src/services/usuariosService');

test('perfiles: IDs estrictos, null explícito y omisión conservada en el contrato', () => {
  for (const id of ['', '0', '2.5', false, {}, -1, 2147483648]) {
    assert.equal(usuarioUpdateSchema.safeParse({ cargo_id: id }).success, false);
    assert.equal(usuarioUpdateSchema.safeParse({ especialidad_id: id }).success, false);
  }
  assert.deepEqual(usuarioUpdateSchema.parse({ cargo_id: '2', especialidad_id: null }), { cargo_id: 2, especialidad_id: null });
  assert.equal(Object.hasOwn(usuarioUpdateSchema.parse({ nombre_completo: 'Sintético' }), 'cargo_id'), false);
  assert.equal(usuarioCreateSchema.safeParse({ nombre_completo: 'Sintético', username: 'fixture', password: 'test-only', rol: 'personal_salud' }).success, true);
});

test('perfiles: transacción, bloqueo, conservación y ausencia de cambios en seguridad', async () => {
  const db = {};
  let current = { id: 4, rol: 'admin', activo: false, nombre_completo: 'Sintético', cargo_id: 1, especialidad_id: 2 };
  const events = [];
  const calls = [];
  const usuariosRepository = {
    obtenerVisibleParaActor: async () => ({ ...current }), obtenerPorId: async () => ({ ...current }),
    obtenerElementoProfesional: async (campo, id, connection) => { assert.equal(connection, db); calls.push(campo); return id === 5 ? { id, activo: true } : null; },
    actualizar: async (args, connection) => {
      assert.equal(connection, db); assert.equal(args.passwordHash, null);
      current = { ...current, nombre_completo: args.nombreCompleto, rol: args.rol, activo: args.activo,
        ...(args.cargoId !== undefined ? { cargo_id: args.cargoId } : {}),
        ...(args.especialidadId !== undefined ? { especialidad_id: args.especialidadId } : {}) };
      return current;
    },
  };
  const dependencies = { usuariosRepository,
    permisosRepository: { enTransaccion: fn => fn(db), bloquearUsuarioPermisos: async () => true },
    sessionService: { revokeAllInTransaction: () => assert.fail('No revocar por perfil') },
    permisosService: { reemplazarPermisosEnTransaccion: () => assert.fail('No reemplazar permisos por perfil') },
    registrarEventoPrivado: async (_req, event, options) => { assert.deepEqual(options, { db, obligatorio: true }); events.push(event); },
  };
  const req = { usuario: { id: 8, rol: 'director' } };
  const edit = body => service.actualizarUsuario({ id: 4, body, req, dependencies });
  await edit({ cargo_id: 1 }); // Asignación histórica inactiva, sin validación nueva.
  assert.deepEqual(calls, []);
  await edit({ cargo_id: 5 });
  assert.equal(current.especialidad_id, 2);
  assert.equal(current.rol, 'admin'); assert.equal(current.activo, false);
  await edit({ especialidad_id: null });
  assert.equal(current.cargo_id, 5); assert.equal(current.especialidad_id, null);
  assert.equal(events.length, 2);
  assert.equal(JSON.stringify(events).includes('Sintético'), false);
  await assert.rejects(edit({ cargo_id: 999 }), { code: 'PERFIL_PROFESIONAL_INVALIDO' });
});
