const test = require('node:test');
const assert = require('node:assert/strict');

const permisosService = require('../src/services/permisosService');
const { registrarEvento } = require('../src/services/auditService');

function crearEscenario({
  permisosIniciales = [],
  catalogo = ['controles.crear', 'controles.editar', 'pacientes.ver'],
  usuarioExiste = true,
  fallaReemplazo = false,
  fallaAuditoria = false,
  fallaRevocacion = false,
  actorId = 7,
  usuarioId = 12,
} = {}) {
  let estado = [...permisosIniciales].sort();
  const auditorias = [];
  const llamadas = [];
  const db = { nombre: 'conexion-transaccional' };

  const permisosRepository = {
    async existenCodigos(codigos, conexion, bloquear) {
      assert.equal(conexion, db);
      assert.equal(bloquear, true);
      return codigos.filter((codigo) => catalogo.includes(codigo));
    },
    async enTransaccion(callback) {
      const snapshot = [...estado];
      llamadas.push('BEGIN');
      try {
        const resultado = await callback(db);
        llamadas.push('COMMIT');
        return resultado;
      } catch (error) {
        estado = snapshot;
        llamadas.push('ROLLBACK');
        throw error;
      }
    },
    async bloquearUsuarioPermisos(id, conexion) {
      assert.equal(conexion, db);
      llamadas.push('LOCK');
      return usuarioExiste && String(id) === String(usuarioId);
    },
    async listarCodigosPorUsuario(id, conexion) {
      assert.equal(conexion, db);
      assert.equal(String(id), String(usuarioId));
      return [...estado];
    },
    async listarPermisosPorUsuario(id, conexion) {
      assert.equal(conexion, db);
      assert.equal(String(id), String(usuarioId));
      return estado.map((codigo) => ({ codigo }));
    },
    async reemplazarPermisosUsuario({ codigos, otorgadoPor }, conexion) {
      assert.equal(conexion, db);
      assert.equal(otorgadoPor, actorId);
      llamadas.push('REPLACE');
      if (fallaReemplazo) throw new Error('fallo al reemplazar');
      estado = [...codigos];
      return estado.map((codigo) => ({ codigo }));
    },
  };

  const usuariosRepository = {
    async obtenerVisibleParaActor({ id }) {
      return usuarioExiste && String(id) === String(usuarioId) ? { id } : null;
    },
  };

  const sessionService = {
    async revokeAllInTransaction({ usuarioId: affectedId, db: conexion }) {
      assert.equal(conexion, db);
      assert.equal(String(affectedId), String(usuarioId));
      llamadas.push('REVOKE_SESSIONS');
      if (fallaRevocacion) throw new Error('fallo al revocar sesiones');
    },
  };

  async function registrarAuditoria(req, evento, opciones) {
    llamadas.push('AUDIT');
    assert.equal(opciones.db, db);
    assert.equal(opciones.obligatorio, true);
    if (fallaAuditoria) throw new Error('fallo de auditoria');
    auditorias.push({ req, evento, opciones });
  }

  const req = {
    usuario: { id: actorId, rol: 'director' },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'node:test' },
  };

  async function ejecutar(codigos) {
    return permisosService.reemplazarPermisosUsuario({
      usuarioId,
      codigos,
      req,
      dependencies: {
        permisosRepository,
        usuariosRepository,
        registrarEvento: registrarAuditoria,
        sessionService,
        authSessionsRepository: {},
      },
    });
  }

  return {
    actorId,
    auditorias,
    ejecutar,
    estado: () => [...estado],
    llamadas,
    usuarioId,
  };
}

test('agregar permisos registra estado anterior, nuevo y agregados', async () => {
  const escenario = crearEscenario({ permisosIniciales: ['pacientes.ver'] });
  await escenario.ejecutar(['pacientes.ver', 'controles.crear']);

  assert.deepEqual(escenario.estado(), ['controles.crear', 'pacientes.ver']);
  assert.equal(escenario.auditorias.length, 1);
  const evento = escenario.auditorias[0].evento;
  assert.equal(evento.descripcion, 'usuario_permisos_actualizados');
  assert.equal(evento.usuarioId, escenario.actorId);
  assert.equal(evento.idEntidad, escenario.usuarioId);
  assert.deepEqual(evento.datosAnteriores.permisos, ['pacientes.ver']);
  assert.deepEqual(evento.datosNuevos.permisos, ['controles.crear', 'pacientes.ver']);
  assert.deepEqual(evento.datosNuevos.permisos_agregados, ['controles.crear']);
  assert.deepEqual(evento.datosNuevos.permisos_retirados, []);
  assert.equal(escenario.llamadas.includes('REVOKE_SESSIONS'), true);
});

test('un actor que cambia sus propios permisos revoca sus propias sesiones', async () => {
  const escenario = crearEscenario({
    actorId: 12,
    usuarioId: 12,
    permisosIniciales: ['pacientes.ver'],
  });
  await escenario.ejecutar(['pacientes.ver', 'controles.crear']);
  assert.equal(escenario.llamadas.includes('REVOKE_SESSIONS'), true);
});

test('un fallo al revocar sesiones revierte el reemplazo de permisos', async () => {
  const escenario = crearEscenario({
    permisosIniciales: ['pacientes.ver'],
    fallaRevocacion: true,
  });
  await assert.rejects(escenario.ejecutar(['controles.crear']), /fallo al revocar sesiones/);
  assert.deepEqual(escenario.estado(), ['pacientes.ver']);
  assert.equal(escenario.llamadas.at(-1), 'ROLLBACK');
});

test('retirar permisos registra solamente los codigos retirados', async () => {
  const escenario = crearEscenario({
    permisosIniciales: ['controles.crear', 'pacientes.ver'],
  });
  await escenario.ejecutar(['pacientes.ver']);

  assert.deepEqual(
    escenario.auditorias[0].evento.datosNuevos.permisos_retirados,
    ['controles.crear']
  );
});

test('agregar y retirar simultaneamente calcula ambos deltas', async () => {
  const escenario = crearEscenario({ permisosIniciales: ['pacientes.ver'] });
  await escenario.ejecutar(['controles.editar']);

  const nuevos = escenario.auditorias[0].evento.datosNuevos;
  assert.deepEqual(nuevos.permisos_agregados, ['controles.editar']);
  assert.deepEqual(nuevos.permisos_retirados, ['pacientes.ver']);
});

test('el mismo conjunto en diferente orden no reemplaza ni audita', async () => {
  const escenario = crearEscenario({
    permisosIniciales: ['controles.crear', 'pacientes.ver'],
  });
  await escenario.ejecutar(['pacientes.ver', 'controles.crear']);

  assert.equal(escenario.auditorias.length, 0);
  assert.equal(escenario.llamadas.includes('REPLACE'), false);
  assert.deepEqual(escenario.llamadas, ['BEGIN', 'LOCK', 'COMMIT']);
});

test('normaliza duplicados y orden antes de reemplazar y auditar', async () => {
  const escenario = crearEscenario();
  await escenario.ejecutar(['pacientes.ver', 'controles.crear', 'pacientes.ver']);

  assert.deepEqual(escenario.estado(), ['controles.crear', 'pacientes.ver']);
  assert.deepEqual(
    escenario.auditorias[0].evento.datosNuevos.permisos,
    ['controles.crear', 'pacientes.ver']
  );
});

test('un fallo al reemplazar revierte y no escribe auditoria', async () => {
  const escenario = crearEscenario({
    permisosIniciales: ['pacientes.ver'],
    fallaReemplazo: true,
  });

  await assert.rejects(escenario.ejecutar(['controles.crear']), /fallo al reemplazar/);
  assert.deepEqual(escenario.estado(), ['pacientes.ver']);
  assert.equal(escenario.auditorias.length, 0);
  assert.equal(escenario.llamadas.at(-1), 'ROLLBACK');
});

test('un fallo de auditoria obligatoria revierte los permisos', async () => {
  const escenario = crearEscenario({
    permisosIniciales: ['pacientes.ver'],
    fallaAuditoria: true,
  });

  await assert.rejects(escenario.ejecutar(['controles.crear']), /fallo de auditoria/);
  assert.deepEqual(escenario.estado(), ['pacientes.ver']);
  assert.equal(escenario.llamadas.at(-1), 'ROLLBACK');
});

test('soporta que actor y usuario afectado sean el mismo', async () => {
  const escenario = crearEscenario({ actorId: 7, usuarioId: 7 });
  await escenario.ejecutar(['pacientes.ver']);

  const evento = escenario.auditorias[0].evento;
  assert.equal(evento.usuarioId, 7);
  assert.equal(evento.datosNuevos.usuario_afectado_id, 7);
});

test('usuario inexistente conserva el error previo y no inicia transaccion', async () => {
  const escenario = crearEscenario({ usuarioExiste: false });

  await assert.rejects(
    escenario.ejecutar(['pacientes.ver']),
    (error) => error.status === 404
  );
  assert.deepEqual(escenario.llamadas, []);
  assert.equal(escenario.auditorias.length, 0);
});

test('permiso inexistente rechaza y revierte sin cambio ni auditoria', async () => {
  const escenario = crearEscenario({ permisosIniciales: ['pacientes.ver'] });

  await assert.rejects(
    escenario.ejecutar(['permiso.inexistente']),
    (error) => error.status === 400 && error.code === 'PERMISOS_INVALIDOS'
  );
  assert.deepEqual(escenario.estado(), ['pacientes.ver']);
  assert.deepEqual(escenario.llamadas, ['BEGIN', 'LOCK', 'ROLLBACK']);
  assert.equal(escenario.auditorias.length, 0);
});

test('registrarEvento usa la conexion indicada e incluye metadatos de solicitud', async () => {
  let consulta;
  const db = {
    async query(sql, params) {
      consulta = { sql, params };
    },
  };
  const req = {
    usuario: { id: 31 },
    ip: '10.0.0.8',
    headers: { 'user-agent': 'auditoria-test' },
  };

  await registrarEvento(req, {
    accion: 'actualizar',
    tabla: 'usuario_permisos',
    registroId: 4,
  }, { db, obligatorio: true });

  assert.match(consulta.sql, /INSERT INTO auditoria_eventos/);
  assert.equal(consulta.params[0], 31);
  assert.equal(consulta.params[11], '10.0.0.8');
  assert.equal(consulta.params[12], 'auditoria-test');
});

test('registrarEvento relanza el fallo cuando la auditoria es obligatoria', async () => {
  const db = {
    async query() {
      throw new Error('insert de auditoria fallido');
    },
  };

  await assert.rejects(
    registrarEvento({}, {
      accion: 'actualizar',
      tabla: 'usuario_permisos',
    }, { db, obligatorio: true }),
    /insert de auditoria fallido/
  );
});
