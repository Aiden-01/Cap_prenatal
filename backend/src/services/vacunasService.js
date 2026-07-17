const vacunasRepository = require('../repositories/vacunasRepository');
const {
  requerirEmbarazoId,
  resolverEmbarazoParaLectura,
  validarEmbarazoEditable,
} = require('../utils/embarazos');
const { registrarEventoPrivado: registrarAuditoria } = require('./auditService');
const { structurallyEqual } = require('./audit/auditDiffBuilder');
const { HttpError } = require('../utils/httpError');

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);
const AUDIT_CONTEXT = Object.freeze({
  crear: Object.freeze({ categoria: 'clinica', entidad: 'vacuna', evento: 'crear' }),
  actualizar: Object.freeze({ categoria: 'clinica', entidad: 'vacuna', evento: 'actualizar' }),
  eliminar: Object.freeze({ categoria: 'clinica', entidad: 'vacuna', evento: 'eliminar' }),
});
const RESULTADO_EXITOSO = 'exitoso';
const VACCINE_FIELDS = ['tipo_vacuna', 'momento', 'numero_dosis', 'fecha_dosis'];
const UPSERT_UPDATE_FIELDS = ['fecha_dosis'];

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

function valoresVacunaEquivalentes(field, previous, next) {
  const previousEmpty = previous === null || previous === undefined || previous === '';
  const nextEmpty = next === null || next === undefined || next === '';
  if (previousEmpty || nextEmpty) return previousEmpty && nextEmpty;

  if (field === 'numero_dosis') {
    const previousNumber = numericValue(previous);
    const nextNumber = numericValue(next);
    if (previousNumber !== null && nextNumber !== null) {
      return previousNumber === nextNumber;
    }
  }
  return structurallyEqual(previous, next);
}

function camposRealmenteModificados(previous, next, fields) {
  return fields.filter(
    (field) => !valoresVacunaEquivalentes(field, previous?.[field], next?.[field])
  );
}

function buildVacunaData(body) {
  return {
    tipo_vacuna: body.tipo_vacuna,
    momento: body.momento,
    numero_dosis: emptyToNull(body.numero_dosis) ?? 1,
    fecha_dosis: emptyToNull(body.fecha_dosis),
  };
}

async function listarVacunas(pacienteId, embarazoIdSolicitado = null) {
  const embarazo = await resolverEmbarazoParaLectura({ pacienteId, embarazoId: embarazoIdSolicitado });
  return embarazo ? vacunasRepository.listarPorEmbarazo(embarazo.id) : [];
}

async function listarAntecedentes({ pacienteId, excluirEmbarazoId }) {
  if (excluirEmbarazoId) {
    await resolverEmbarazoParaLectura({ pacienteId, embarazoId: excluirEmbarazoId });
  }
  return vacunasRepository.listarAntecedentes({ pacienteId, excluirEmbarazoId });
}

async function obtenerVacuna({ pacienteId, embarazoId = null, id }) {
  const vacuna = await vacunasRepository.obtenerPorId(id);
  if (!vacuna) throw new HttpError(404, 'Vacuna no encontrada');
  if (!vacuna.embarazo_id) throw new HttpError(409, 'La vacuna es un antecedente de solo lectura');
  await resolverEmbarazoParaLectura({ pacienteId, embarazoId: vacuna.embarazo_id });
  if (embarazoId && String(vacuna.embarazo_id) !== String(embarazoId)) {
    throw new HttpError(404, 'Vacuna no encontrada en el embarazo seleccionado');
  }
  return vacuna;
}

async function guardarVacuna({ pacienteId, embarazoId, body, req }) {
  requerirEmbarazoId(embarazoId);
  const clinicalData = buildVacunaData(body);
  return vacunasRepository.enTransaccion(async (client) => {
    await validarEmbarazoEditable({ pacienteId, embarazoId, db: client, bloquear: true });
    const before = await vacunasRepository.obtenerPorDosis({
      embarazoId,
      tipoVacuna: clinicalData.tipo_vacuna,
      momento: clinicalData.momento,
      numeroDosis: clinicalData.numero_dosis,
    }, client);
    const modifiedFields = before
      ? camposRealmenteModificados(before, clinicalData, UPSERT_UPDATE_FIELDS)
      : VACCINE_FIELDS;
    if (before && modifiedFields.length === 0) return before;

    const vacuna = await vacunasRepository.upsert({
      paciente_id: pacienteId,
      embarazo_id: embarazoId,
      ...clinicalData,
      registrado_por: req.usuario.id,
      updated_by: req.usuario.id,
    }, client);
    if (!vacuna) {
      await validarEmbarazoEditable({ pacienteId, embarazoId, db: client, bloquear: true });
      throw new HttpError(409, 'No fue posible guardar la vacuna');
    }

    const action = before ? 'actualizar' : 'crear';
    await registrarAuditoria(req, {
      contexto: AUDIT_CONTEXT[action],
      accion: action,
      entidadId: vacuna.id,
      pacienteId,
      embarazoId,
      cambios: auditChangesForFields(modifiedFields, action),
      metadata: { resultado: RESULTADO_EXITOSO },
    }, { db: client, obligatorio: true });

    return vacuna;
  });
}

async function actualizarVacuna({ pacienteId, embarazoId, id, body, req }) {
  requerirEmbarazoId(embarazoId);
  const clinicalData = buildVacunaData(body);
  return vacunasRepository.enTransaccion(async (client) => {
    const initial = await vacunasRepository.obtenerPorId(id, client);
    if (!initial) throw new HttpError(404, 'Vacuna no encontrada');
    if (String(initial.embarazo_id) !== String(embarazoId)) {
      throw new HttpError(404, 'Vacuna no encontrada en el embarazo seleccionado');
    }
    await validarEmbarazoEditable({ pacienteId, embarazoId, db: client, bloquear: true });
    const before = await vacunasRepository.obtenerPorId(id, client);
    if (!before || String(before.embarazo_id) !== String(embarazoId)) {
      throw new HttpError(404, 'Vacuna no encontrada en el embarazo seleccionado');
    }

    const modifiedFields = camposRealmenteModificados(before, clinicalData, VACCINE_FIELDS);
    if (modifiedFields.length === 0) return before;
    const modifiedData = Object.fromEntries(
      modifiedFields.map((field) => [field, clinicalData[field]])
    );
    modifiedData.updated_by = req.usuario.id;
    const vacuna = await vacunasRepository.actualizar({
      id,
      embarazoId,
      data: modifiedData,
      campos: modifiedFields,
      pacienteId,
    }, client);

    if (!vacuna) {
      await validarEmbarazoEditable({ pacienteId, embarazoId, db: client, bloquear: true });
      throw new HttpError(404, 'Vacuna no encontrada');
    }

    await registrarAuditoria(req, {
      contexto: AUDIT_CONTEXT.actualizar,
      accion: 'actualizar',
      entidadId: vacuna.id,
      pacienteId,
      embarazoId,
      cambios: auditChangesForFields(modifiedFields, 'actualizar'),
      metadata: { resultado: RESULTADO_EXITOSO },
    }, { db: client, obligatorio: true });

    return vacuna;
  });
}

async function eliminarVacuna({ pacienteId, embarazoId, id, req }) {
  requerirEmbarazoId(embarazoId);
  return vacunasRepository.enTransaccion(async (client) => {
    const initial = await vacunasRepository.obtenerPorId(id, client);
    if (!initial) throw new HttpError(404, 'Vacuna no encontrada');
    if (String(initial.embarazo_id) !== String(embarazoId)) {
      throw new HttpError(404, 'Vacuna no encontrada en el embarazo seleccionado');
    }
    await validarEmbarazoEditable({ pacienteId, embarazoId, db: client, bloquear: true });
    const before = await vacunasRepository.obtenerPorId(id, client);
    if (!before || String(before.embarazo_id) !== String(embarazoId)) {
      throw new HttpError(404, 'Vacuna no encontrada en el embarazo seleccionado');
    }
    const { rowCount } = await vacunasRepository.eliminar(
      { id, embarazoId, pacienteId },
      client
    );

    if (rowCount === 0) {
      await validarEmbarazoEditable({ pacienteId, embarazoId, db: client, bloquear: true });
      throw new HttpError(404, 'Vacuna no encontrada');
    }

    await registrarAuditoria(req, {
      contexto: AUDIT_CONTEXT.eliminar,
      accion: 'eliminar',
      entidadId: id,
      pacienteId,
      embarazoId,
      cambios: auditChangesForFields(VACCINE_FIELDS, 'eliminar'),
      metadata: { resultado: RESULTADO_EXITOSO },
    }, { db: client, obligatorio: true });

    return { message: 'Vacuna eliminada' };
  });
}

module.exports = {
  VACCINE_FIELDS,
  valoresVacunaEquivalentes,
  listarVacunas,
  listarAntecedentes,
  obtenerVacuna,
  guardarVacuna,
  actualizarVacuna,
  eliminarVacuna,
};
