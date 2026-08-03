const vacunasRepository = require('../repositories/vacunasRepository');
const {
  requerirEmbarazoId,
  resolverEmbarazoParaLectura,
  validarEmbarazoEditable,
} = require('../utils/embarazos');
const { registrarEventoPrivado: registrarAuditoria } = require('./auditService');
const { structurallyEqual } = require('./audit/auditDiffBuilder');
const { HttpError } = require('../utils/httpError');
const {
  VACCINE_TYPES,
  VACCINE_RULES,
  validateVaccineType,
} = require('../domain/vacunasRules');

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);
const AUDIT_CONTEXT = Object.freeze({
  crear: Object.freeze({ categoria: 'clinica', entidad: 'vacuna', evento: 'crear' }),
  actualizar: Object.freeze({ categoria: 'clinica', entidad: 'vacuna', evento: 'actualizar' }),
  eliminar: Object.freeze({ categoria: 'clinica', entidad: 'vacuna', evento: 'eliminar' }),
});
const RESULTADO_EXITOSO = 'exitoso';
const VACCINE_FIELDS = ['tipo_vacuna', 'momento', 'numero_dosis', 'fecha_dosis', 'embarazo_id'];
const VALIDATED_VACCINE_TYPES = new Set(Object.values(VACCINE_TYPES));
const hasOwn = (value, field) => Object.prototype.hasOwnProperty.call(value || {}, field);

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
    numero_dosis: body.tipo_vacuna === VACCINE_TYPES.INFLUENZA
      ? 1
      : emptyToNull(body.numero_dosis),
    fecha_dosis: emptyToNull(body.fecha_dosis),
  };
}

function buildVacunaUpdateData(body, previous) {
  const tipoVacuna = hasOwn(body, 'tipo_vacuna') ? body.tipo_vacuna : previous.tipo_vacuna;
  return {
    tipo_vacuna: tipoVacuna,
    momento: hasOwn(body, 'momento') ? body.momento : previous.momento,
    numero_dosis: tipoVacuna === VACCINE_TYPES.INFLUENZA
      ? 1
      : hasOwn(body, 'numero_dosis')
        ? (emptyToNull(body.numero_dosis) ?? previous.numero_dosis)
        : previous.numero_dosis,
    fecha_dosis: hasOwn(body, 'fecha_dosis')
      ? emptyToNull(body.fecha_dosis)
      : previous.fecha_dosis,
    embarazo_id: hasOwn(body, 'embarazo_id')
      ? body.embarazo_id
      : previous.embarazo_id,
  };
}

function projectedHistory(history, { excludedId = null, candidate = null } = {}) {
  const projected = excludedId === null
    ? [...history]
    : history.filter((record) => String(record.id) !== String(excludedId));
  if (candidate) projected.push(candidate);
  return projected;
}

function validateAffectedClinicalTypes({ previousType = null, nextType = null, history, pregnancies }) {
  const affectedTypes = new Set([previousType, nextType].filter((type) => (
    VALIDATED_VACCINE_TYPES.has(type)
  )));
  affectedTypes.forEach((type) => validateVaccineType({ type, history, pregnancies }));
}

async function lockAndLoadClinicalContext({ pacienteId, embarazoId, vaccineType, client }) {
  const paciente = await vacunasRepository.bloquearPaciente(pacienteId, client);
  if (!paciente) throw new HttpError(404, 'Paciente no encontrada');
  const estadosPermitidos = VACCINE_RULES[vaccineType]?.writablePregnancyStates;
  const embarazo = await validarEmbarazoEditable({
    pacienteId,
    embarazoId,
    ...(estadosPermitidos ? { estadosPermitidos } : {}),
    db: client,
    bloquear: true,
  });
  const [history, pregnancies] = await Promise.all([
    vacunasRepository.listarHistoriaClinica(pacienteId, client),
    vacunasRepository.listarEmbarazosPaciente(pacienteId, client),
  ]);
  return { embarazo, history, pregnancies };
}

function translateVaccineUniqueViolation(error, data) {
  if (error?.code !== '23505') return error;
  if (error.constraint === 'ux_vacunas_td_paciente_posicion') {
    const label = Number(data.numero_dosis) <= 3
      ? `Dosis ${data.numero_dosis}`
      : `Refuerzo ${Number(data.numero_dosis) - 3}`;
    return new HttpError(409, `Ya existe una ${label} de TD para esta paciente.`, {
      code: 'TD_POSITION_ALREADY_EXISTS',
      details: { vaccine_type: VACCINE_TYPES.TD, duplicate_position: data.numero_dosis },
    });
  }
  if (error.constraint === 'ux_vacunas_spr_sr_paciente_posicion') {
    return new HttpError(409, `Ya existe una Dosis ${data.numero_dosis} de SR/SPR para esta paciente.`, {
      code: 'SPR_SR_POSITION_ALREADY_EXISTS',
      details: { vaccine_type: VACCINE_TYPES.SPR_SR, duplicate_position: data.numero_dosis },
    });
  }
  if (error.constraint === 'ux_vacunas_tdap_embarazo') {
    return new HttpError(409, 'Ya existe una aplicación de Tdap para este embarazo.', {
      code: 'TDAP_ALREADY_EXISTS',
      details: { maximum: 1, pregnancy_id: data.embarazo_id },
    });
  }
  return error;
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
    const context = await lockAndLoadClinicalContext({
      pacienteId,
      embarazoId,
      vaccineType: clinicalData.tipo_vacuna,
      client,
    });
    const candidate = {
      paciente_id: pacienteId,
      embarazo_id: embarazoId,
      ...clinicalData,
    };
    const history = projectedHistory(context.history, { candidate });
    validateAffectedClinicalTypes({
      nextType: clinicalData.tipo_vacuna,
      history,
      pregnancies: context.pregnancies,
    });

    let vacuna;
    try {
      const data = {
        ...candidate,
        registrado_por: req.usuario.id,
        updated_by: req.usuario.id,
      };
      vacuna = await vacunasRepository.insertar(data, client);
    } catch (error) {
      throw translateVaccineUniqueViolation(error, candidate);
    }
    if (!vacuna) {
      await validarEmbarazoEditable({ pacienteId, embarazoId, db: client, bloquear: true });
      throw new HttpError(409, 'No fue posible guardar la vacuna');
    }

    await registrarAuditoria(req, {
      contexto: AUDIT_CONTEXT.crear,
      accion: 'crear',
      entidadId: vacuna.id,
      pacienteId,
      embarazoId,
      cambios: auditChangesForFields(VACCINE_FIELDS, 'crear'),
      metadata: { resultado: RESULTADO_EXITOSO },
    }, { db: client, obligatorio: true });

    return vacuna;
  });
}

async function actualizarVacuna({ pacienteId, embarazoId, id, body, req }) {
  requerirEmbarazoId(embarazoId);
  return vacunasRepository.enTransaccion(async (client) => {
    const context = await lockAndLoadClinicalContext({
      pacienteId,
      embarazoId,
      client,
    });
    const initial = await vacunasRepository.obtenerPorId(id, client);
    if (!initial) throw new HttpError(404, 'Vacuna no encontrada');
    if (String(initial.embarazo_id) !== String(embarazoId)) {
      throw new HttpError(404, 'Vacuna no encontrada en el embarazo seleccionado');
    }
    const before = await vacunasRepository.obtenerPorId(id, client);
    if (!before || String(before.embarazo_id) !== String(embarazoId)) {
      throw new HttpError(404, 'Vacuna no encontrada en el embarazo seleccionado');
    }

    const clinicalData = buildVacunaUpdateData(body, before);
    const modifiedFields = camposRealmenteModificados(before, clinicalData, VACCINE_FIELDS);
    if (modifiedFields.length === 0) return before;
    if (String(clinicalData.embarazo_id) !== String(embarazoId)) {
      const estadosPermitidos = VACCINE_RULES[clinicalData.tipo_vacuna]?.writablePregnancyStates;
      await validarEmbarazoEditable({
        pacienteId,
        embarazoId: clinicalData.embarazo_id,
        ...(estadosPermitidos ? { estadosPermitidos } : {}),
        db: client,
        bloquear: true,
      });
    }
    const candidate = {
      ...before,
      ...clinicalData,
      paciente_id: pacienteId,
      id,
    };
    const history = projectedHistory(context.history, { excludedId: id, candidate });
    validateAffectedClinicalTypes({
      previousType: before.tipo_vacuna,
      nextType: candidate.tipo_vacuna,
      history,
      pregnancies: context.pregnancies,
    });
    const modifiedData = Object.fromEntries(
      modifiedFields.map((field) => [field, clinicalData[field]])
    );
    modifiedData.updated_by = req.usuario.id;
    let vacuna;
    try {
      vacuna = await vacunasRepository.actualizar({
        id,
        embarazoId,
        data: modifiedData,
        campos: modifiedFields,
        pacienteId,
      }, client);
    } catch (error) {
      throw translateVaccineUniqueViolation(error, candidate);
    }

    if (!vacuna) {
      await validarEmbarazoEditable({ pacienteId, embarazoId, db: client, bloquear: true });
      throw new HttpError(404, 'Vacuna no encontrada');
    }

    await registrarAuditoria(req, {
      contexto: AUDIT_CONTEXT.actualizar,
      accion: 'actualizar',
      entidadId: vacuna.id,
      pacienteId,
      embarazoId: candidate.embarazo_id,
      cambios: auditChangesForFields(modifiedFields, 'actualizar'),
      metadata: { resultado: RESULTADO_EXITOSO },
    }, { db: client, obligatorio: true });

    return vacuna;
  });
}

async function eliminarVacuna({ pacienteId, embarazoId, id, req }) {
  requerirEmbarazoId(embarazoId);
  return vacunasRepository.enTransaccion(async (client) => {
    const context = await lockAndLoadClinicalContext({
      pacienteId,
      embarazoId,
      client,
    });
    const initial = await vacunasRepository.obtenerPorId(id, client);
    if (!initial) throw new HttpError(404, 'Vacuna no encontrada');
    if (String(initial.embarazo_id) !== String(embarazoId)) {
      throw new HttpError(404, 'Vacuna no encontrada en el embarazo seleccionado');
    }
    const before = await vacunasRepository.obtenerPorId(id, client);
    if (!before || String(before.embarazo_id) !== String(embarazoId)) {
      throw new HttpError(404, 'Vacuna no encontrada en el embarazo seleccionado');
    }
    const history = projectedHistory(context.history, { excludedId: id });
    validateAffectedClinicalTypes({
      previousType: before.tipo_vacuna,
      history,
      pregnancies: context.pregnancies,
    });
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
