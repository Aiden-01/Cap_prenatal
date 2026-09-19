const citasRepository = require('../repositories/citasPrenatalesRepository');
const { getGuatemalaDateInputValue } = require('../utils/guatemalaTime');
const { registrarEventoPrivado: registrarAuditoria } = require('./auditService');
const { HttpError } = require('../utils/httpError');

const AUDIT_CONTEXT = Object.freeze({
  inasistencia: Object.freeze({ categoria: 'clinica', entidad: 'cita_prenatal', evento: 'materializar_inasistencia' }),
  asistencia: Object.freeze({ categoria: 'clinica', entidad: 'cita_prenatal', evento: 'materializar_asistencia' }),
  reconciliar: Object.freeze({ categoria: 'clinica', entidad: 'cita_prenatal', evento: 'reconciliar_asistencia_tardia' }),
});

function fechaIso(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value || '').slice(0, 10);
}

async function auditarTransicion(req, anterior, nueva, contexto, motivo, db, controlId = null) {
  await registrarAuditoria(req || {}, {
    contexto,
    accion: 'actualizar',
    entidadId: anterior.id,
    embarazoId: anterior.embarazo_id,
    cambios: {
      anteriores: { estado_cita: anterior.estado, control_cumplimiento_id: anterior.control_cumplimiento_id },
      nuevos: { estado_cita: nueva.estado, control_cumplimiento_id: controlId },
    },
    metadata: {
      resultado: 'exitoso',
      motivo_codigo: motivo,
      fecha_programada: fechaIso(anterior.fecha_programada),
    },
  }, { db, obligatorio: true });
}

async function materializarEnTransaccion({
  db,
  embarazoId = null,
  fechaOperativa = getGuatemalaDateInputValue(),
  req = null,
  usarAdvisoryLock = false,
}) {
  if (typeof citasRepository.listarProgramadasVencidas !== 'function') {
    return { total_procesado: 0, atendidas: 0, inasistentes: 0, omitido_por_bloqueo: false };
  }
  if (usarAdvisoryLock && !(await citasRepository.adquirirBloqueoMaterializacion(db))) {
    return { total_procesado: 0, atendidas: 0, inasistentes: 0, omitido_por_bloqueo: true };
  }
  const citas = await citasRepository.listarProgramadasVencidas({ fechaOperativa, embarazoId }, db);
  const result = { total_procesado: 0, atendidas: 0, inasistentes: 0, omitido_por_bloqueo: false };
  for (const cita of citas) {
    const controles = await citasRepository.listarControlesCoincidentes(cita, db);
    if (controles.length > 1) {
      throw new HttpError(409, 'Existen controles coincidentes ambiguos para una cita vencida', {
        code: 'CITA_CONTROL_COINCIDENTE_AMBIGUO',
      });
    }
    if (controles.length === 1) {
      const nueva = await citasRepository.marcarAtendida({
        citaId: cita.id,
        embarazoId: cita.embarazo_id,
        controlCumplimientoId: controles[0].id,
        usuarioId: req?.usuario?.id || null,
      }, db);
      if (nueva) {
        await auditarTransicion(req, cita, nueva, AUDIT_CONTEXT.asistencia,
          'control_misma_fecha_existente', db, Number(controles[0].id));
        result.atendidas += 1;
        result.total_procesado += 1;
      }
      continue;
    }
    const nueva = await citasRepository.marcarInasistente({
      citaId: cita.id,
      embarazoId: cita.embarazo_id,
      usuarioId: req?.usuario?.id || null,
    }, db);
    if (nueva) {
      await auditarTransicion(req, cita, nueva, AUDIT_CONTEXT.inasistencia,
        'cita_vencida_sin_control_coincidente', db);
      result.inasistentes += 1;
      result.total_procesado += 1;
    }
  }
  return result;
}

async function materializarGlobal(options = {}) {
  return citasRepository.enTransaccion((db) => materializarEnTransaccion({
    ...options,
    db,
    usarAdvisoryLock: true,
  }));
}

async function reconciliarAsistenciaTardia({ cita, control, usuarioId, req, db }) {
  if (fechaIso(cita.fecha_programada) !== fechaIso(control.fecha)) return null;
  if (await citasRepository.existeSeguimientoDerivado(cita.id, db)) {
    throw new HttpError(
      409,
      'La inasistencia ya originó una cita de seguimiento y requiere corrección administrativa.',
      { code: 'CITA_INASISTENCIA_CON_SEGUIMIENTO_DERIVADO' }
    );
  }
  const nueva = await citasRepository.reconciliarAsistenciaTardia({
    citaId: cita.id,
    embarazoId: cita.embarazo_id,
    controlCumplimientoId: control.id,
    usuarioId,
  }, db);
  if (!nueva) {
    throw new HttpError(409, 'La inasistencia cambió durante la reconciliación', {
      code: 'CITA_RECONCILIACION_CONFLICTO',
    });
  }
  await auditarTransicion(req, cita, nueva, AUDIT_CONTEXT.reconciliar,
    'control_misma_fecha_registrado_tardiamente', db, Number(control.id));
  return nueva;
}

module.exports = {
  AUDIT_CONTEXT,
  materializarEnTransaccion,
  materializarGlobal,
  reconciliarAsistenciaTardia,
};
