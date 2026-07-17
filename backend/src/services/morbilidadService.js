const morbilidadRepository = require('../repositories/morbilidadRepository');
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
  crear: Object.freeze({ categoria: 'clinica', entidad: 'morbilidad', evento: 'crear' }),
  actualizar: Object.freeze({ categoria: 'clinica', entidad: 'morbilidad', evento: 'actualizar' }),
  eliminar: Object.freeze({ categoria: 'clinica', entidad: 'morbilidad', evento: 'eliminar' }),
});
const RESULTADO_EXITOSO = 'exitoso';

const MORBILIDAD_FIELDS = [
  'fecha',
  'hora',
  'motivo_consulta',
  'historia_enfermedad_actual',
  'revision_por_sistemas',
  'examen_fisico',
  'impresion_clinica',
  'tratamiento_referencia',
  'nombre_cargo_atiende',
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

function valoresMorbilidadEquivalentes(field, previous, next) {
  const previousEmpty = previous === null || previous === undefined || previous === '';
  const nextEmpty = next === null || next === undefined || next === '';
  if (previousEmpty || nextEmpty) return previousEmpty && nextEmpty;

  if (field === 'hora') {
    const previousTime = normalizedTime(previous);
    const nextTime = normalizedTime(next);
    if (previousTime !== null && nextTime !== null) return previousTime === nextTime;
  }

  const previousNumber = numericValue(previous);
  const nextNumber = numericValue(next);
  if (previousNumber !== null && nextNumber !== null) return previousNumber === nextNumber;
  return structurallyEqual(previous, next);
}

function camposRealmenteModificados(previous, next, fields) {
  return fields.filter(
    (field) => !valoresMorbilidadEquivalentes(field, previous?.[field], next?.[field])
  );
}

function buildUpdateData(body) {
  const dataWithTime = withGuatemalaTimeFallback(body, { onlyWhenHoraIsPresent: true });
  const campos = MORBILIDAD_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(dataWithTime, field));
  const data = {};
  for (const field of campos) data[field] = emptyToNull(dataWithTime[field]);
  return { campos, data };
}

function buildCreateData({ pacienteId, embarazoId, body, usuarioId }) {
  const dataWithTime = withGuatemalaTimeFallback(body, { onlyWhenHoraIsPresent: true });
  return {
    paciente_id: pacienteId,
    embarazo_id: embarazoId,
    fecha: dataWithTime.fecha,
    hora: emptyToNull(dataWithTime.hora),
    motivo_consulta: dataWithTime.motivo_consulta,
    historia_enfermedad_actual: emptyToNull(dataWithTime.historia_enfermedad_actual),
    revision_por_sistemas: emptyToNull(dataWithTime.revision_por_sistemas),
    examen_fisico: emptyToNull(dataWithTime.examen_fisico),
    impresion_clinica: emptyToNull(dataWithTime.impresion_clinica),
    tratamiento_referencia: emptyToNull(dataWithTime.tratamiento_referencia),
    nombre_cargo_atiende: emptyToNull(dataWithTime.nombre_cargo_atiende),
    registrado_por: usuarioId,
    updated_by: usuarioId,
  };
}

async function listarMorbilidad(pacienteId, embarazoIdSolicitado = null) {
  const embarazo = await resolverEmbarazoParaLectura({ pacienteId, embarazoId: embarazoIdSolicitado });
  return embarazo ? morbilidadRepository.listarPorEmbarazo(embarazo.id) : [];
}

async function obtenerMorbilidad({ pacienteId, embarazoId = null, id }) {
  const registro = await morbilidadRepository.obtenerPorId(id);
  if (!registro) throw new HttpError(404, 'Registro no encontrado');
  await resolverEmbarazoParaLectura({ pacienteId, embarazoId: registro.embarazo_id });
  if (embarazoId && String(registro.embarazo_id) !== String(embarazoId)) {
    throw new HttpError(404, 'Registro no encontrado en el embarazo seleccionado');
  }
  return registro;
}

async function guardarMorbilidad({ pacienteId, embarazoId, body, req }) {
  requerirEmbarazoId(embarazoId);
  return morbilidadRepository.enTransaccion(async (client) => {
    await validarEmbarazoEditable({ pacienteId, embarazoId, db: client, bloquear: true });
    const data = buildCreateData({
      pacienteId,
      embarazoId,
      body,
      usuarioId: req.usuario.id,
    });
    const registro = await morbilidadRepository.insertar(data, client);
    if (!registro) {
      await validarEmbarazoEditable({ pacienteId, embarazoId, db: client, bloquear: true });
      throw new HttpError(409, 'No fue posible guardar la morbilidad');
    }

    await registrarEventoPrivado(req, {
      contexto: AUDIT_CONTEXT.crear,
      accion: 'crear',
      entidadId: registro.id,
      pacienteId,
      embarazoId,
      cambios: auditChangesForFields(MORBILIDAD_FIELDS, 'crear'),
      metadata: { resultado: RESULTADO_EXITOSO },
    }, { db: client, obligatorio: true });

    return registro;
  });
}

async function actualizarMorbilidad({ pacienteId, embarazoId, id, body, req }) {
  requerirEmbarazoId(embarazoId);
  const { campos, data } = buildUpdateData(body);
  if (campos.length === 0) throw new HttpError(400, 'Sin campos para actualizar');

  return morbilidadRepository.enTransaccion(async (client) => {
    const initial = await morbilidadRepository.obtenerPorId(id, client);
    if (!initial) throw new HttpError(404, 'Registro no encontrado');
    if (String(initial.embarazo_id) !== String(embarazoId)) {
      throw new HttpError(404, 'Registro no encontrado en el embarazo seleccionado');
    }
    await validarEmbarazoEditable({ pacienteId, embarazoId, db: client, bloquear: true });
    const before = await morbilidadRepository.obtenerPorId(id, client);
    if (!before || String(before.embarazo_id) !== String(embarazoId)) {
      throw new HttpError(404, 'Registro no encontrado en el embarazo seleccionado');
    }

    const modifiedFields = camposRealmenteModificados(before, data, campos);
    if (modifiedFields.length === 0) return { message: 'Registro actualizado' };
    const modifiedData = Object.fromEntries(
      modifiedFields.map((field) => [field, data[field]])
    );
    const { registro, rowCount } = await morbilidadRepository.actualizar({
      id,
      embarazoId,
      data: modifiedData,
      campos: modifiedFields,
      updatedBy: req.usuario.id,
      pacienteId,
    }, client);

    if (rowCount === 0) {
      await validarEmbarazoEditable({ pacienteId, embarazoId, db: client, bloquear: true });
      throw new HttpError(404, 'Registro no encontrado');
    }

    await registrarEventoPrivado(req, {
      contexto: AUDIT_CONTEXT.actualizar,
      accion: 'actualizar',
      entidadId: registro?.id || id,
      pacienteId,
      embarazoId,
      cambios: auditChangesForFields(modifiedFields, 'actualizar'),
      metadata: { resultado: RESULTADO_EXITOSO },
    }, { db: client, obligatorio: true });

    return { message: 'Registro actualizado' };
  });
}

async function eliminarMorbilidad({ pacienteId, embarazoId, id, req }) {
  requerirEmbarazoId(embarazoId);
  return morbilidadRepository.enTransaccion(async (client) => {
    const initial = await morbilidadRepository.obtenerPorId(id, client);
    if (!initial) throw new HttpError(404, 'Registro no encontrado');
    if (String(initial.embarazo_id) !== String(embarazoId)) {
      throw new HttpError(404, 'Registro no encontrado en el embarazo seleccionado');
    }
    await validarEmbarazoEditable({ pacienteId, embarazoId, db: client, bloquear: true });
    const before = await morbilidadRepository.obtenerPorId(id, client);
    if (!before || String(before.embarazo_id) !== String(embarazoId)) {
      throw new HttpError(404, 'Registro no encontrado en el embarazo seleccionado');
    }
    const { rowCount } = await morbilidadRepository.eliminar(
      { id, embarazoId, pacienteId },
      client
    );

    if (rowCount === 0) {
      await validarEmbarazoEditable({ pacienteId, embarazoId, db: client, bloquear: true });
      throw new HttpError(404, 'Registro no encontrado');
    }

    await registrarEventoPrivado(req, {
      contexto: AUDIT_CONTEXT.eliminar,
      accion: 'eliminar',
      entidadId: id,
      pacienteId,
      embarazoId,
      cambios: auditChangesForFields(MORBILIDAD_FIELDS, 'eliminar'),
      metadata: { resultado: RESULTADO_EXITOSO },
    }, { db: client, obligatorio: true });

    return { message: 'Registro eliminado' };
  });
}

module.exports = {
  MORBILIDAD_FIELDS,
  valoresMorbilidadEquivalentes,
  listarMorbilidad,
  obtenerMorbilidad,
  guardarMorbilidad,
  actualizarMorbilidad,
  eliminarMorbilidad,
};
