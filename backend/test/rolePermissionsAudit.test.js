const test = require('node:test');
const assert = require('node:assert/strict');

const usuariosService = require('../src/services/usuariosService');
const permisosService = require('../src/services/permisosService');

const ADMIN = [
  'controles.crear',
  'controles.editar',
  'pacientes.crear',
  'pacientes.editar',
  'pacientes.ver',
  'reportes.ver',
];
const PERSONAL = [...ADMIN, 'mapa_riesgo.ver'].sort();
const CATALOGO = [...new Set([...PERSONAL, 'reportes.exportar'])].sort();

function crearEscenario({
  rolInicial = 'admin',
  permisosIniciales = ADMIN,
  usuarioExiste = true,
  fallaAuditoriaEn = null,
  fallaRevocacion = false,
  actorId = 7,
  usuarioId = 12,
  actorRol = 'director',
} = {}) {
  let usuario = usuarioExiste ? {
    id: usuarioId,
    nombre_completo: 'Usuario objetivo',
    username: 'objetivo',
    activo: true,
    rol: rolInicial,
  } : null;
  let permisos = [...permisosIniciales].sort();
  const auditorias = [];
  const llamadas = [];
  const db = { nombre: 'conexion-cambio-rol' };

  const usuariosRepository = {
    async obtenerVisibleParaActor({ id }) {
      return usuario && String(id) === String(usuarioId) ? { ...usuario } : null;
    },
    async obtenerPorId(id, conexion) {
      assert.equal(conexion, db);
      return usuario && String(id) === String(usuarioId) ? { ...usuario } : null;
    },
    async actualizar(args, conexion) {
      if (conexion !== undefined) assert.equal(conexion, db);
      llamadas.push('UPDATE_USER');
      usuario = {
        ...usuario,
        nombre_completo: args.nombreCompleto,
        activo: args.activo,
        rol: args.rol,
        updated_by: args.updatedBy,
      };
      return { ...usuario };
    },
    async contarAdminsActivos() {
      return 2;
    },
    async contarDirectoresActivos() {
      return 2;
    },
  };

  const permisosRepository = {
    codigosPorRol(rol) {
      if (rol === 'director') return null;
      return rol === 'personal_salud' ? [...PERSONAL] : [...ADMIN];
    },
    async listarCatalogo(conexion) {
      assert.equal(conexion, db);
      return CATALOGO.map((codigo) => ({ codigo }));
    },
    async enTransaccion(callback) {
      const usuarioSnapshot = usuario ? { ...usuario } : null;
      const permisosSnapshot = [...permisos];
      const auditoriasSnapshot = auditorias.length;
      llamadas.push('BEGIN');
      try {
        const resultado = await callback(db);
        llamadas.push('COMMIT');
        return resultado;
      } catch (error) {
        usuario = usuarioSnapshot;
        permisos = permisosSnapshot;
        auditorias.length = auditoriasSnapshot;
        llamadas.push('ROLLBACK');
        throw error;
      }
    },
    async bloquearUsuarioPermisos(id, conexion) {
      assert.equal(conexion, db);
      llamadas.push('LOCK');
      return Boolean(usuario && String(id) === String(usuarioId));
    },
    async existenCodigos(codigos, conexion, bloquear) {
      assert.equal(conexion, db);
      assert.equal(bloquear, true);
      return codigos.filter((codigo) => CATALOGO.includes(codigo));
    },
    async listarCodigosPorUsuario(id, conexion) {
      assert.equal(conexion, db);
      assert.equal(String(id), String(usuarioId));
      return [...permisos];
    },
    async listarPermisosPorUsuario(id, conexion) {
      assert.equal(conexion, db);
      assert.equal(String(id), String(usuarioId));
      return permisos.map((codigo) => ({ codigo }));
    },
    async reemplazarPermisosUsuario({ codigos, otorgadoPor }, conexion) {
      assert.equal(conexion, db);
      assert.equal(otorgadoPor, actorId);
      llamadas.push('REPLACE_PERMISSIONS');
      permisos = [...codigos];
      return permisos.map((codigo) => ({ codigo }));
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

  async function registrarEvento(req, evento, opciones) {
    assert.equal(opciones.db, db);
    assert.equal(opciones.obligatorio, true);
    llamadas.push(`AUDIT_${evento.tabla}`);
    if (fallaAuditoriaEn === evento.tabla) {
      throw new Error('auditoria obligatoria fallida');
    }
    auditorias.push({ req, evento, opciones });
  }

  async function registrarAuditoria(req, evento) {
    llamadas.push(`AUDIT_${evento.tabla}`);
    auditorias.push({ req, evento, opciones: null });
  }

  const req = {
    usuario: { id: actorId, rol: actorRol },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'node:test' },
  };

  async function ejecutar(rolOBody) {
    const body = typeof rolOBody === 'string'
      ? {
        nombre_completo: 'Usuario actualizado',
        activo: true,
        rol: rolOBody,
      }
      : rolOBody;
    return usuariosService.actualizarUsuario({
      id: usuarioId,
      body,
      req,
      dependencies: {
        usuariosRepository,
        permisosRepository,
        permisosService,
        registrarAuditoria,
        registrarEvento,
        sessionService,
        authSessionsRepository: {},
      },
    });
  }

  return {
    actorId,
    auditorias,
    ejecutar,
    llamadas,
    permisos: () => [...permisos],
    usuario: () => (usuario ? { ...usuario } : null),
    usuarioId,
  };
}

function eventoPermisos(escenario) {
  return escenario.auditorias.find(({ evento }) => evento.tabla === 'usuario_permisos')?.evento;
}

test('cambio de rol agrega los permisos predeterminados faltantes', async () => {
  const escenario = crearEscenario();
  await escenario.ejecutar('personal_salud');

  assert.deepEqual(escenario.permisos(), PERSONAL);
  const evento = eventoPermisos(escenario);
  assert.deepEqual(evento.datosNuevos.permisos_agregados, ['mapa_riesgo.ver']);
  assert.deepEqual(evento.datosNuevos.permisos_retirados, []);
  assert.equal(evento.datosNuevos.origen, 'cambio_rol');
  assert.equal(evento.datosNuevos.rol_anterior, 'admin');
  assert.equal(evento.datosNuevos.rol_nuevo, 'personal_salud');
  assert.equal(escenario.llamadas.includes('REVOKE_SESSIONS'), true);
});

test('reinicio administrativo de password revoca sesiones', async () => {
  const escenario = crearEscenario();
  await escenario.ejecutar({
    nombre_completo: 'Usuario objetivo',
    activo: true,
    rol: 'admin',
    password: 'NuevaClaveSegura123!',
  });
  assert.equal(escenario.llamadas.includes('REVOKE_SESSIONS'), true);
});

test('desactivar usuario revoca sesiones', async () => {
  const escenario = crearEscenario();
  await escenario.ejecutar({ nombre_completo: 'Usuario objetivo', activo: false, rol: 'admin' });
  assert.equal(escenario.llamadas.includes('REVOKE_SESSIONS'), true);
  assert.equal(escenario.usuario().activo, false);
});

test('fallo de revocacion revierte cambio critico de rol', async () => {
  const escenario = crearEscenario({ fallaRevocacion: true });
  await assert.rejects(escenario.ejecutar('personal_salud'), /fallo al revocar sesiones/);
  assert.equal(escenario.usuario().rol, 'admin');
  assert.deepEqual(escenario.permisos(), ADMIN);
  assert.equal(escenario.llamadas.at(-1), 'ROLLBACK');
});

test('cambio de rol retira permisos que no pertenecen al nuevo rol', async () => {
  const escenario = crearEscenario({
    rolInicial: 'personal_salud',
    permisosIniciales: PERSONAL,
  });
  await escenario.ejecutar('admin');

  assert.deepEqual(escenario.permisos(), ADMIN);
  assert.deepEqual(
    eventoPermisos(escenario).datosNuevos.permisos_retirados,
    ['mapa_riesgo.ver']
  );
});

test('cambio de rol sin diferencia efectiva no genera evento de permisos', async () => {
  const escenario = crearEscenario({ permisosIniciales: PERSONAL });
  await escenario.ejecutar('personal_salud');

  assert.equal(eventoPermisos(escenario), undefined);
  assert.equal(escenario.auditorias.length, 1);
  assert.equal(escenario.auditorias[0].evento.tabla, 'usuarios');
  assert.equal(escenario.llamadas.includes('REPLACE_PERMISSIONS'), false);
});

test('mantiene la politica actual y elimina permisos personalizados al cambiar rol', async () => {
  const escenario = crearEscenario({
    permisosIniciales: [...ADMIN, 'reportes.exportar'],
  });
  await escenario.ejecutar('personal_salud');

  assert.deepEqual(escenario.permisos(), PERSONAL);
  assert.deepEqual(
    eventoPermisos(escenario).datosNuevos.permisos_retirados,
    ['reportes.exportar']
  );
});

test('fallo de auditoria revierte rol, permisos y el evento previo', async () => {
  const escenario = crearEscenario({ fallaAuditoriaEn: 'usuarios' });

  await assert.rejects(
    escenario.ejecutar('personal_salud'),
    /auditoria obligatoria fallida/
  );
  assert.equal(escenario.usuario().rol, 'admin');
  assert.deepEqual(escenario.permisos(), ADMIN);
  assert.equal(escenario.auditorias.length, 0);
  assert.equal(escenario.llamadas.at(-1), 'ROLLBACK');
});

test('usuario inexistente no inicia transaccion ni genera auditoria', async () => {
  const escenario = crearEscenario({ usuarioExiste: false });

  await assert.rejects(
    escenario.ejecutar('personal_salud'),
    (error) => error.status === 404
  );
  assert.deepEqual(escenario.llamadas, []);
  assert.equal(escenario.auditorias.length, 0);
});

test('actor y usuario afectado pueden ser el mismo', async () => {
  const escenario = crearEscenario({ actorId: 12, usuarioId: 12, actorRol: 'admin' });
  await escenario.ejecutar('personal_salud');

  const evento = eventoPermisos(escenario);
  assert.equal(evento.usuarioId, 12);
  assert.equal(evento.datosNuevos.usuario_afectado_id, 12);
  assert.equal(escenario.llamadas.includes('REVOKE_SESSIONS'), true);
});

test('actualizacion sin rol conserva permisos y auditoria normal de usuario', async () => {
  const personalizados = [...ADMIN, 'reportes.exportar'].sort();
  const escenario = crearEscenario({ permisosIniciales: personalizados });

  await escenario.ejecutar({
    nombre_completo: 'Nombre sin cambio de rol',
    activo: true,
  });

  assert.equal(escenario.usuario().nombre_completo, 'Nombre sin cambio de rol');
  assert.equal(escenario.usuario().rol, 'admin');
  assert.deepEqual(escenario.permisos(), personalizados);
  assert.equal(escenario.llamadas.includes('LOCK'), false);
  assert.equal(escenario.llamadas.includes('REPLACE_PERMISSIONS'), false);
  assert.equal(eventoPermisos(escenario), undefined);
  assert.equal(escenario.auditorias.length, 1);
  assert.equal(escenario.auditorias[0].evento.tabla, 'usuarios');
});

test('enviar el mismo rol conserva permisos personalizados', async () => {
  const personalizados = [...ADMIN, 'reportes.exportar'].sort();
  const escenario = crearEscenario({ permisosIniciales: personalizados });

  await escenario.ejecutar({
    nombre_completo: 'Otro nombre',
    activo: true,
    rol: 'admin',
  });

  assert.equal(escenario.usuario().nombre_completo, 'Otro nombre');
  assert.deepEqual(escenario.permisos(), personalizados);
  assert.equal(escenario.llamadas.includes('REPLACE_PERMISSIONS'), false);
  assert.equal(eventoPermisos(escenario), undefined);
  assert.equal(escenario.auditorias.length, 1);
});

test('mismo rol sin otros cambios mantiene el comportamiento actual', async () => {
  const escenario = crearEscenario();

  await escenario.ejecutar({
    nombre_completo: 'Usuario objetivo',
    activo: true,
    rol: 'admin',
  });

  assert.deepEqual(escenario.permisos(), ADMIN);
  assert.equal(escenario.llamadas.includes('REPLACE_PERMISSIONS'), false);
  assert.equal(eventoPermisos(escenario), undefined);
  assert.deepEqual(
    escenario.llamadas,
    ['UPDATE_USER', 'AUDIT_usuarios']
  );
});

test('cambio real de rol junto con otro campo comparte transaccion y auditorias', async () => {
  const escenario = crearEscenario();

  await escenario.ejecutar({
    nombre_completo: 'Nombre y rol actualizados',
    activo: true,
    rol: 'personal_salud',
  });

  assert.equal(escenario.usuario().nombre_completo, 'Nombre y rol actualizados');
  assert.equal(escenario.usuario().rol, 'personal_salud');
  assert.deepEqual(escenario.permisos(), PERSONAL);
  assert.equal(escenario.auditorias.length, 2);
  assert.equal(escenario.auditorias[0].opciones.db, escenario.auditorias[1].opciones.db);
  assert.equal(escenario.auditorias[0].opciones.obligatorio, true);
  assert.equal(escenario.auditorias[1].opciones.obligatorio, true);
  assert.deepEqual(escenario.llamadas.slice(-2), ['AUDIT_usuarios', 'COMMIT']);
});
