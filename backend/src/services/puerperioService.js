const puerperioRepository = require('../repositories/puerperioRepository');
const {
  requerirEmbarazoId,
  resolverEmbarazoParaLectura,
  validarEmbarazoEditable,
} = require('../utils/embarazos');
const { withGuatemalaTimeFallback } = require('../utils/guatemalaTime');
const { registrarEventoPrivado } = require('./auditService');
const { structurallyEqual } = require('./audit/auditDiffBuilder');
const { HttpError } = require('../utils/httpError');

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);
const AUDIT_CONTEXT = Object.freeze({
  crear: Object.freeze({ categoria: 'clinica', entidad: 'puerperio', evento: 'crear' }),
  actualizar: Object.freeze({ categoria: 'clinica', entidad: 'puerperio', evento: 'actualizar' }),
  eliminar: Object.freeze({ categoria: 'clinica', entidad: 'puerperio', evento: 'eliminar' }),
  embarazoEstado: Object.freeze({
    categoria: 'clinica',
    entidad: 'embarazo',
    evento: 'cambiar_estado',
  }),
});
const RESULTADO_EXITOSO = 'exitoso';

const PUERPERIO_FIELDS = [
  'numero_atencion', 'fecha', 'hora', 'signos_peligro',
  'dias_despues_parto', 'lugar_atencion_parto', 'quien_atendio_parto',
  'recien_nacido_vivo', 'tipo_parto', 'tuvo_apego_inmediato',
  'lactancia_materna_exclusiva', 'herida_operatoria',
  'pa_sistolica', 'pa_diastolica', 'frecuencia_cardiaca',
  'frecuencia_respiratoria', 'temperatura',
  'examen_mamas', 'examen_ginecologico',
  'orientacion_consejeria', 'impresion_clinica', 'tratamiento',
  'nombre_cargo_atiende',
];

const NULLABLE_BOOLEAN_FIELDS = [
  'recien_nacido_vivo',
  'tuvo_apego_inmediato',
  'lactancia_materna_exclusiva',
];

function auditChangesForFields(fields, action) {
  const namedFields = [...new Set(fields)].sort();
  const marker = (value) => Object.fromEntries(namedFields.map((field) => [field, value]));
  if (action === 'crear') return { nuevos: marker('registrado') };
  if (action === 'eliminar') return { anteriores: marker('eliminado') };
  return {
    anteriores: marker('anterior'),
    nuevos: marker('nuevo'),
  };
}

function numericValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  if (!/^-?(?:\d+\.?\d*|\d*\.\d+)$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(value) {
  if (typeof value === 'boolean') return { valid: true, value };
  if (value === 1 || value === '1' || value === 'true') return { valid: true, value: true };
  if (value === 0 || value === '0' || value === 'false') return { valid: true, value: false };
  return { valid: false, value: null };
}

function normalizedTime(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || 0);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return (hours * 3600) + (minutes * 60) + seconds;
}

function normalizedText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
}

function valoresPuerperioEquivalentes(field, previous, next) {
  const previousEmpty = previous === null || previous === undefined || previous === '';
  const nextEmpty = next === null || next === undefined || next === '';
  if (previousEmpty || nextEmpty) return previousEmpty && nextEmpty;

  if (field === 'hora') {
    const previousTime = normalizedTime(previous);
    const nextTime = normalizedTime(next);
    if (previousTime !== null && nextTime !== null) return previousTime === nextTime;
  }

  if (NULLABLE_BOOLEAN_FIELDS.includes(field)) {
    const previousBoolean = booleanValue(previous);
    const nextBoolean = booleanValue(next);
    if (previousBoolean.valid && nextBoolean.valid) {
      return previousBoolean.value === nextBoolean.value;
    }
  }

  const previousNumber = numericValue(previous);
  const nextNumber = numericValue(next);
  if (previousNumber !== null && nextNumber !== null) return previousNumber === nextNumber;
  if (structurallyEqual(previous, next)) return true;
  return normalizedText(previous) === normalizedText(next);
}

function camposRealmenteModificados(previous, next, fields) {
  return fields.filter(
    (field) => !valoresPuerperioEquivalentes(field, previous?.[field], next?.[field])
  );
}

function buildUpdateData(body) {
  const dataWithTime = withGuatemalaTimeFallback(body, { onlyWhenHoraIsPresent: true });
  const campos = PUERPERIO_FIELDS.filter(
    (field) => Object.prototype.hasOwnProperty.call(dataWithTime, field)
  );
  const data = {};
  for (const field of campos) data[field] = emptyToNull(dataWithTime[field]);
  return { campos, data };
}

function normalizeCreateValue(field, body) {
  if (NULLABLE_BOOLEAN_FIELDS.includes(field)) return body[field] ?? null;
  return emptyToNull(body[field]);
}

function buildCreateData({ pacienteId, embarazoId, body, usuarioId }) {
  const data = {
    paciente_id: pacienteId,
    embarazo_id: embarazoId,
  };

  for (const field of PUERPERIO_FIELDS) {
    data[field] = normalizeCreateValue(field, body);
  }

  data.registrado_por = usuarioId;
  data.updated_by = usuarioId;
  return data;
}

async function listarPuerperio(pacienteId, embarazoIdSolicitado = null) {
  const embarazo = await resolverEmbarazoParaLectura({ pacienteId, embarazoId: embarazoIdSolicitado });
  return embarazo ? puerperioRepository.listarPorEmbarazo(embarazo.id) : [];
}

async function obtenerPuerperio({ pacienteId, embarazoId = null, id }) {
  const control = await puerperioRepository.obtenerPorId(id);
  if (!control) throw new HttpError(404, 'Control de puerperio no encontrado');
  await resolverEmbarazoParaLectura({ pacienteId, embarazoId: control.embarazo_id });
  if (embarazoId && String(control.embarazo_id) !== String(embarazoId)) {
    throw new HttpError(404, 'Control de puerperio no encontrado en el embarazo seleccionado');
  }
  return control;
}

async function guardarPuerperio({ pacienteId, embarazoId, body, req }) {
  const dataWithTime = withGuatemalaTimeFallback(body);
  requerirEmbarazoId(embarazoId);
  const data = buildCreateData({
    pacienteId,
    embarazoId,
    body: dataWithTime,
    usuarioId: req.usuario.id,
  });
  const updatableFields = PUERPERIO_FIELDS.filter((field) => field !== 'numero_atencion');

  return puerperioRepository.enTransaccion(async (client) => {
    const embarazoBefore = await puerperioRepository.obtenerEmbarazoParaActualizar(
      { embarazoId, pacienteId },
      client
    );
    if (!embarazoBefore) {
      throw new HttpError(404, 'Embarazo no encontrado para esta paciente', {
        code: 'PREGNANCY_NOT_FOUND',
      });
    }
    if (!['activo', 'puerperio'].includes(embarazoBefore.estado)) {
      throw new HttpError(409, 'El embarazo esta cerrado y su expediente es de solo lectura', {
        code: 'PREGNANCY_READ_ONLY',
      });
    }

    const before = await puerperioRepository.obtenerPorNumeroYEmbarazo(
      embarazoId,
      dataWithTime.numero_atencion,
      client
    );
    const modifiedFields = before
      ? camposRealmenteModificados(before, data, updatableFields)
      : PUERPERIO_FIELDS;

    const embarazoActualizado = embarazoBefore.estado === 'activo'
      ? await puerperioRepository.marcarEmbarazoEnPuerperio({
        embarazoId,
        pacienteId,
        fechaCierre: dataWithTime.fecha,
        updatedBy: req.usuario.id,
      }, client)
      : null;

    let control = before;
    if (!before || modifiedFields.length > 0) {
      control = await puerperioRepository.upsert({
        data,
        updateFields: before ? modifiedFields : updatableFields,
      }, client);
      if (!control) {
        throw new HttpError(409, 'No fue posible guardar el control de puerperio');
      }
    }

    if (embarazoActualizado) {
      await registrarEventoPrivado(req, {
        contexto: AUDIT_CONTEXT.embarazoEstado,
        accion: 'estado',
        entidadId: embarazoId,
        pacienteId,
        embarazoId,
        cambios: {
          anteriores: { estado_embarazo: embarazoBefore.estado },
          nuevos: { estado_embarazo: embarazoActualizado.estado },
        },
        metadata: { resultado: RESULTADO_EXITOSO },
      }, { db: client, obligatorio: true });
    }

    if (!before || modifiedFields.length > 0) {
      const action = before ? 'actualizar' : 'crear';
      await registrarEventoPrivado(req, {
        contexto: AUDIT_CONTEXT[action],
        accion: action,
        entidadId: control.id,
        pacienteId,
        embarazoId,
        cambios: auditChangesForFields(modifiedFields, action),
        metadata: { resultado: RESULTADO_EXITOSO },
      }, { db: client, obligatorio: true });
    }

    return control;
  });
}

async function actualizarPuerperio({ pacienteId, embarazoId, id, body, req }) {
  requerirEmbarazoId(embarazoId);
  const { campos, data } = buildUpdateData(body);
  if (campos.length === 0) throw new HttpError(400, 'Sin campos para actualizar');

  return puerperioRepository.enTransaccion(async (client) => {
    const initial = await puerperioRepository.obtenerPorId(id, client);
    if (!initial) throw new HttpError(404, 'Control de puerperio no encontrado');
    if (String(initial.embarazo_id) !== String(embarazoId)) {
      throw new HttpError(404, 'Control de puerperio no encontrado en el embarazo seleccionado');
    }
    await validarEmbarazoEditable({ pacienteId, embarazoId, db: client, bloquear: true });
    const before = await puerperioRepository.obtenerPorIdYEmbarazo(id, embarazoId, client);
    if (!before) {
      throw new HttpError(404, 'Control de puerperio no encontrado en el embarazo seleccionado');
    }

    const modifiedFields = camposRealmenteModificados(before, data, campos);
    if (modifiedFields.length === 0) return before;
    const modifiedData = Object.fromEntries(
      modifiedFields.map((field) => [field, data[field]])
    );
    const control = await puerperioRepository.actualizar({
      id,
      embarazoId,
      data: modifiedData,
      campos: modifiedFields,
      updatedBy: req.usuario.id,
      pacienteId,
    }, client);

    if (!control) throw new HttpError(404, 'Control de puerperio no encontrado');

    await registrarEventoPrivado(req, {
      contexto: AUDIT_CONTEXT.actualizar,
      accion: 'actualizar',
      entidadId: control.id,
      pacienteId,
      embarazoId,
      cambios: auditChangesForFields(modifiedFields, 'actualizar'),
      metadata: { resultado: RESULTADO_EXITOSO },
    }, { db: client, obligatorio: true });

    return control;
  });
}

async function eliminarPuerperio({ pacienteId, embarazoId, id, req }) {
  requerirEmbarazoId(embarazoId);
  return puerperioRepository.enTransaccion(async (client) => {
    const initial = await puerperioRepository.obtenerPorId(id, client);
    if (!initial) throw new HttpError(404, 'Control de puerperio no encontrado');
    if (String(initial.embarazo_id) !== String(embarazoId)) {
      throw new HttpError(404, 'Control de puerperio no encontrado en el embarazo seleccionado');
    }
    await validarEmbarazoEditable({ pacienteId, embarazoId, db: client, bloquear: true });
    const before = await puerperioRepository.obtenerPorIdYEmbarazo(id, embarazoId, client);
    if (!before) {
      throw new HttpError(404, 'Control de puerperio no encontrado en el embarazo seleccionado');
    }
    const { rowCount } = await puerperioRepository.eliminar(
      { id, embarazoId, pacienteId },
      client
    );

    if (rowCount === 0) throw new HttpError(404, 'Control de puerperio no encontrado');

    await registrarEventoPrivado(req, {
      contexto: AUDIT_CONTEXT.eliminar,
      accion: 'eliminar',
      entidadId: id,
      pacienteId,
      embarazoId,
      cambios: auditChangesForFields(PUERPERIO_FIELDS, 'eliminar'),
      metadata: { resultado: RESULTADO_EXITOSO },
    }, { db: client, obligatorio: true });

    return { message: 'Control de puerperio eliminado' };
  });
}

module.exports = {
  PUERPERIO_FIELDS,
  valoresPuerperioEquivalentes,
  listarPuerperio,
  obtenerPuerperio,
  guardarPuerperio,
  actualizarPuerperio,
  eliminarPuerperio,
};
