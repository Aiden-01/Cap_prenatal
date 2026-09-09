const citasRepository = require('../repositories/citasPrenatalesRepository');
const {
  requerirEmbarazoId,
  resolverEmbarazoParaLectura,
  validarEmbarazoActivo,
  validarEmbarazoEditable,
} = require('../utils/embarazos');
const { getGuatemalaDateInputValue } = require('../utils/guatemalaTime');
const { registrarEventoPrivado: registrarAuditoria } = require('./auditService');
const { HttpError } = require('../utils/httpError');

const RESULTADO_EXITOSO = 'exitoso';
const AUDIT_CONTEXT = Object.freeze({
  reprogramar: Object.freeze({
    categoria: 'clinica', entidad: 'cita_prenatal', evento: 'reprogramar',
  }),
  cancelar: Object.freeze({
    categoria: 'clinica', entidad: 'cita_prenatal', evento: 'cancelar',
  }),
  asignar: Object.freeze({
    categoria: 'clinica', entidad: 'cita_prenatal', evento: 'crear',
  }),
});

function fechaIso(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value || '').slice(0, 10);
}

function citaNoEncontrada() {
  return new HttpError(404, 'Cita no encontrada en el embarazo seleccionado', {
    code: 'CITA_NOT_FOUND',
  });
}

function transicionInvalida(cita, accion) {
  return new HttpError(
    409,
    `No se puede ${accion} una cita en estado ${cita.estado}`,
    {
      code: 'CITA_TRANSICION_INVALIDA',
      details: { estado: cita.estado },
    }
  );
}

function resolverUnicaProgramada(citas) {
  if (citas.length <= 1) return citas[0] || null;
  throw new HttpError(
    409,
    'Existen varias citas programadas para el mismo embarazo',
    {
      code: 'CITAS_VIGENTES_AMBIGUAS',
      details: { cantidad: citas.length },
    }
  );
}

async function obtenerCitaVigente({ pacienteId, embarazoId }) {
  requerirEmbarazoId(embarazoId);
  await resolverEmbarazoParaLectura({ pacienteId, embarazoId });
  const citas = await citasRepository.listarProgramadasVigentesPorEmbarazo(embarazoId);
  return resolverUnicaProgramada(citas);
}

async function listarCalendario({ from, to }) {
  const items = await citasRepository.listarCalendarioPorRango({
    desde: from,
    hasta: to,
  });
  return {
    range: { from, to },
    items,
  };
}

async function listarSinProximaCita() {
  return citasRepository.listarSinProximaCita();
}

function citaRequiereControlOrigen() {
  return new HttpError(
    409,
    'El embarazo necesita al menos un control prenatal antes de asignar una cita',
    { code: 'CITA_REQUIERE_CONTROL_ORIGEN' }
  );
}

async function asignarCita({ pacienteId, embarazoId, fechaProgramada, req }) {
  requerirEmbarazoId(embarazoId);
  const nuevaFecha = fechaIso(fechaProgramada);
  if (nuevaFecha < getGuatemalaDateInputValue()) {
    throw new HttpError(400, 'La fecha programada no puede estar en el pasado', {
      code: 'CITA_FECHA_PASADA',
    });
  }

  try {
    return await citasRepository.enTransaccion(async (client) => {
      await validarEmbarazoActivo({
        pacienteId,
        embarazoId,
        db: client,
        bloquear: true,
      });

      const vigentes = await citasRepository.listarProgramadasVigentesPorEmbarazo(
        embarazoId,
        client,
        { bloquear: true }
      );
      if (vigentes.length > 0) {
        throw new HttpError(409, 'El embarazo ya tiene una cita programada vigente', {
          code: 'CITA_PROGRAMADA_VIGENTE',
        });
      }

      const control = await citasRepository.obtenerUltimoControlElegible(
        embarazoId,
        client,
        { bloquear: true }
      );
      if (!control) throw citaRequiereControlOrigen();

      const ultimaDelControl = await citasRepository.obtenerUltimaPorControl(
        { controlId: control.id, embarazoId },
        client,
        { bloquear: true }
      );

      const cita = ultimaDelControl
        ? await citasRepository.crearProgramadaComoContinuacion({
          citaAnterior: ultimaDelControl,
          fechaProgramada: nuevaFecha,
          usuarioId: req.usuario.id,
        }, client)
        : await citasRepository.crearProgramadaDesdeControl({
          embarazoId,
          controlOrigenId: control.id,
          fechaProgramada: nuevaFecha,
          usuarioId: req.usuario.id,
        }, client);

      if (!cita || cita.estado !== 'programada') {
        throw new HttpError(409, 'No fue posible crear la cita prenatal', {
          code: 'CITA_CREACION_NO_REALIZADA',
        });
      }

      await registrarAuditoria(req, {
        contexto: AUDIT_CONTEXT.asignar,
        accion: 'crear',
        entidadId: cita.id,
        pacienteId,
        embarazoId,
        cambios: {
          nuevos: {
            estado_cita: cita.estado,
            fecha_programada: fechaIso(cita.fecha_programada),
            control_origen_id: Number(control.id),
            reprogramada_desde_id: ultimaDelControl ? Number(ultimaDelControl.id) : null,
          },
        },
        metadata: {
          resultado: RESULTADO_EXITOSO,
          motivo_codigo: ultimaDelControl
            ? 'cita_asignada_continuando_historial'
            : 'cita_asignada_desde_ultimo_control',
        },
      }, { db: client, obligatorio: true });

      return { cita, idempotente: false };
    });
  } catch (error) {
    if (error?.code === '23505' && error?.constraint === 'ux_citas_programada_embarazo') {
      throw new HttpError(409, 'El embarazo ya tiene una cita programada vigente', {
        code: 'CITA_PROGRAMADA_VIGENTE',
      });
    }
    throw error;
  }
}

async function reprogramarCita({ pacienteId, embarazoId, citaId, fechaProgramada, req }) {
  requerirEmbarazoId(embarazoId);
  return citasRepository.enTransaccion(async (client) => {
    await validarEmbarazoEditable({
      pacienteId,
      embarazoId,
      db: client,
      bloquear: true,
    });
    const anterior = await citasRepository.obtenerPorIdYEmbarazo(
      citaId,
      embarazoId,
      client,
      { bloquear: true }
    );
    if (!anterior) throw citaNoEncontrada();
    if (anterior.estado !== 'programada' || anterior.control_cumplimiento_id) {
      throw transicionInvalida(anterior, 'reprogramar');
    }

    const nuevaFecha = fechaIso(fechaProgramada);
    if (fechaIso(anterior.fecha_programada) === nuevaFecha) {
      throw new HttpError(400, 'La nueva fecha debe ser diferente', {
        code: 'CITA_FECHA_SIN_CAMBIO',
      });
    }
    if (nuevaFecha < getGuatemalaDateInputValue()) {
      throw new HttpError(400, 'La nueva fecha no puede estar en el pasado', {
        code: 'CITA_FECHA_PASADA',
      });
    }

    const actualizada = await citasRepository.marcarReprogramada({
      citaId,
      embarazoId,
      usuarioId: req.usuario.id,
    }, client);
    if (!actualizada) throw transicionInvalida(anterior, 'reprogramar');

    const nueva = await citasRepository.crearHijaReprogramada({
      citaAnterior: anterior,
      fechaProgramada: nuevaFecha,
      usuarioId: req.usuario.id,
    }, client);
    if (!nueva) {
      throw new HttpError(409, 'No fue posible crear la nueva cita', {
        code: 'CITA_REPROGRAMACION_NO_CREADA',
      });
    }

    await registrarAuditoria(req, {
      contexto: AUDIT_CONTEXT.reprogramar,
      accion: 'actualizar',
      entidadId: anterior.id,
      pacienteId,
      embarazoId,
      cambios: {
        anteriores: {
          estado_cita: anterior.estado,
          fecha_programada: fechaIso(anterior.fecha_programada),
          cita_nueva_id: null,
        },
        nuevos: {
          estado_cita: actualizada.estado,
          fecha_programada: fechaIso(anterior.fecha_programada),
          cita_nueva_id: Number(nueva.id),
        },
      },
      metadata: { resultado: RESULTADO_EXITOSO, motivo_codigo: 'cita_reprogramada' },
    }, { db: client, obligatorio: true });

    return { cita_anterior: actualizada, cita_nueva: nueva };
  });
}

async function cancelarCita({ pacienteId, embarazoId, citaId, req }) {
  requerirEmbarazoId(embarazoId);
  return citasRepository.enTransaccion(async (client) => {
    await validarEmbarazoEditable({
      pacienteId,
      embarazoId,
      db: client,
      bloquear: true,
    });
    const anterior = await citasRepository.obtenerPorIdYEmbarazo(
      citaId,
      embarazoId,
      client,
      { bloquear: true }
    );
    if (!anterior) throw citaNoEncontrada();
    if (anterior.estado === 'cancelada') {
      return { cita: anterior, idempotente: true };
    }
    if (anterior.estado !== 'programada' || anterior.control_cumplimiento_id) {
      throw transicionInvalida(anterior, 'cancelar');
    }

    const cancelada = await citasRepository.marcarCancelada({
      citaId,
      embarazoId,
      usuarioId: req.usuario.id,
    }, client);
    if (!cancelada) throw transicionInvalida(anterior, 'cancelar');

    await registrarAuditoria(req, {
      contexto: AUDIT_CONTEXT.cancelar,
      accion: 'actualizar',
      entidadId: anterior.id,
      pacienteId,
      embarazoId,
      cambios: {
        anteriores: { estado_cita: anterior.estado },
        nuevos: { estado_cita: cancelada.estado },
      },
      metadata: { resultado: RESULTADO_EXITOSO, motivo_codigo: 'cita_cancelada' },
    }, { db: client, obligatorio: true });

    return { cita: cancelada, idempotente: false };
  });
}

module.exports = {
  asignarCita,
  cancelarCita,
  listarCalendario,
  listarSinProximaCita,
  obtenerCitaVigente,
  reprogramarCita,
  resolverUnicaProgramada,
};
