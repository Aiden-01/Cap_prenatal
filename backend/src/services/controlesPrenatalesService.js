const controlesRepository = require('../repositories/controlesPrenatalesRepository');
const citasRepository = require('../repositories/citasPrenatalesRepository');
const {
  requerirEmbarazoId,
  resolverEmbarazoParaLectura,
  validarEmbarazoActivo,
  validarEmbarazoEditable,
} = require('../utils/embarazos');
const { withGuatemalaTimeFallback } = require('../utils/guatemalaTime');
const { registrarEventoPrivado: registrarAuditoria } = require('./auditService');
const { structurallyEqual } = require('./audit/auditDiffBuilder');
const { HttpError } = require('../utils/httpError');
const { filtrarCamposVih, VIH_FIELDS, puedeVerVih } = require('../utils/datosSensibles');

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);
const AUDIT_CONTEXT = Object.freeze({
  crear: Object.freeze({ categoria: 'clinica', entidad: 'control_prenatal', evento: 'crear' }),
  actualizar: Object.freeze({ categoria: 'clinica', entidad: 'control_prenatal', evento: 'actualizar' }),
  eliminar: Object.freeze({ categoria: 'clinica', entidad: 'control_prenatal', evento: 'eliminar' }),
  citaCrear: Object.freeze({ categoria: 'clinica', entidad: 'cita_prenatal', evento: 'crear' }),
  citaAtender: Object.freeze({ categoria: 'clinica', entidad: 'cita_prenatal', evento: 'atender' }),
});
const RESULTADO_EXITOSO = 'exitoso';
const CITA_REPROGRAMACION_REQUERIDA = Object.freeze({
  statusCode: 409,
  message: 'La fecha de una cita existente debe cambiarse desde el flujo de reprogramacion',
  code: 'CITA_REPROGRAMACION_REQUERIDA',
});

const CONTROL_FIELDS = [
  'numero_control', 'fecha', 'hora', 'motivo_consulta',
  'peligro_hemorragia_vaginal', 'peligro_palidez', 'peligro_dolor_cabeza',
  'peligro_hipertension', 'peligro_dolor_epigastrico',
  'peligro_trastornos_visuales', 'peligro_fiebre', 'peligro_otro',
  'edad_gestacional_semanas', 'nombre_acompanante', 'nombre_cargo_atiende',
  'pa_sistolica', 'pa_diastolica', 'frecuencia_cardiaca', 'frecuencia_respiratoria',
  'temperatura', 'perimetro_braquial_cm', 'peso_kg', 'talla_cm', 'imc',
  'examen_bucodental', 'examen_mamas',
  'altura_uterina_cm', 'fcf', 'movimientos_fetales',
  'situacion_fetal', 'presentacion_fetal',
  'sangre_manchado', 'verrugas_herpes_papilomas', 'flujo_vaginal', 'otros_ginecologico',
  'hematologia_realizada', 'hematologia_resultado',
  'glicemia_realizada', 'glicemia_resultado',
  'grupo_rh_realizado', 'grupo_rh_resultado',
  'orina_realizada', 'orina_bacteriuria', 'orina_proteinuria',
  'heces_realizada', 'heces_resultado',
  'vih_realizado', 'vih_resultado', 'vih_resultado_valor',
  'vdrl_realizado', 'vdrl_resultado', 'vdrl_tratamiento_indicado',
  'torch_realizado', 'torch_resultado_positivo', 'torch_resultado_valor',
  'papanicolau_ivaa_realizado', 'papanicolau_ivaa_fecha_toma', 'papanicolau_ivaa_resultado',
  'hepatitis_b_realizado', 'hepatitis_b_resultado',
  'otros_lab', 'usg_realizado', 'usg_hallazgos',
  'sulfato_ferroso', 'sulfato_ferroso_tabletas',
  'acido_folico', 'acido_folico_tabletas',
  'suplementacion_hallazgos', 'suplementacion_tratamiento',
  'orient_plan_emergencia_parto', 'orient_alimentacion_embarazo',
  'orient_senales_peligro', 'orient_lactancia_materna',
  'orient_planificacion_familiar', 'orient_importancia_postparto',
  'orient_vacunacion_nino', 'orient_pre_post_prueba_vih',
  'orient_importancia_atenciones', 'orient_tratamiento_its_pareja',
  'orient_otros', 'impresion_clinica', 'tratamiento', 'cita_siguiente',
];

const CONTROL_BOOLEAN_DEFAULT_FALSE = [
  'peligro_hemorragia_vaginal',
  'peligro_palidez',
  'peligro_dolor_cabeza',
  'peligro_hipertension',
  'peligro_dolor_epigastrico',
  'peligro_trastornos_visuales',
  'peligro_fiebre',
  'sangre_manchado',
  'verrugas_herpes_papilomas',
  'flujo_vaginal',
  'hematologia_realizada',
  'glicemia_realizada',
  'grupo_rh_realizado',
  'orina_realizada',
  'heces_realizada',
  'vih_realizado',
  'vdrl_realizado',
  'vdrl_tratamiento_indicado',
  'torch_realizado',
  'papanicolau_ivaa_realizado',
  'hepatitis_b_realizado',
  'usg_realizado',
  'sulfato_ferroso',
  'acido_folico',
  'orient_plan_emergencia_parto',
  'orient_alimentacion_embarazo',
  'orient_senales_peligro',
  'orient_lactancia_materna',
  'orient_planificacion_familiar',
  'orient_importancia_postparto',
  'orient_vacunacion_nino',
  'orient_pre_post_prueba_vih',
  'orient_importancia_atenciones',
  'orient_tratamiento_its_pareja',
];

const CONTROL_NULLABLE_BOOLEAN = [
  'examen_bucodental',
  'examen_mamas',
  'movimientos_fetales',
  'orina_bacteriuria',
  'orina_proteinuria',
  'torch_resultado_positivo',
];

function seleccionarCamposAuditoria(registro, campos) {
  if (!registro || typeof registro !== 'object') return {};
  return Object.fromEntries(
    campos
      .filter((campo) => Object.prototype.hasOwnProperty.call(registro, campo))
      .map((campo) => [campo, registro[campo]])
  );
}

function numericValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  if (!/^-?(?:\d+\.?\d*|\d*\.\d+)$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function valoresControlEquivalentes(anterior, nuevo) {
  const anteriorVacio = anterior === null || anterior === undefined || anterior === '';
  const nuevoVacio = nuevo === null || nuevo === undefined || nuevo === '';
  if (anteriorVacio || nuevoVacio) return anteriorVacio && nuevoVacio;

  const numeroAnterior = numericValue(anterior);
  const numeroNuevo = numericValue(nuevo);
  if (numeroAnterior !== null && numeroNuevo !== null) {
    return numeroAnterior === numeroNuevo;
  }
  return structurallyEqual(anterior, nuevo);
}

function camposRealmenteModificados(anterior, nuevo, campos) {
  return campos.filter(
    (campo) => !valoresControlEquivalentes(anterior?.[campo], nuevo?.[campo])
  );
}

function impedirCambioHistoricoDeCita(modifiedFields) {
  if (!modifiedFields.includes('cita_siguiente')) return;
  throw new HttpError(
    CITA_REPROGRAMACION_REQUERIDA.statusCode,
    CITA_REPROGRAMACION_REQUERIDA.message,
    { code: CITA_REPROGRAMACION_REQUERIDA.code }
  );
}

function esValorVacio(value) {
  return value === null || value === undefined || value === '';
}

function resolverTransicionDeCita(anterior, nuevo, modifiedFields) {
  if (!modifiedFields.includes('cita_siguiente')) return null;
  if (esValorVacio(anterior) && !esValorVacio(nuevo)) return 'crear';
  if (!esValorVacio(anterior) && esValorVacio(nuevo)) {
    throw new HttpError(
      409,
      'Para quitar una cita vigente debe utilizar el flujo Cancelar cita',
      { code: 'CITA_CANCELACION_REQUERIDA' }
    );
  }
  impedirCambioHistoricoDeCita(modifiedFields);
  return null;
}

function controlHistoricoNoPuedeOriginarCita() {
  return new HttpError(
    409,
    'El control ya no puede originar una proxima cita porque existen controles prenatales posteriores',
    { code: 'CITA_CONTROL_NO_ES_ULTIMO' }
  );
}

function citaVigenteYaExiste() {
  return new HttpError(
    409,
    'El embarazo ya tiene una cita programada vigente',
    { code: 'CITA_PROGRAMADA_VIGENTE' }
  );
}

function citaOriginadaPorControlYaExiste() {
  return new HttpError(
    409,
    'El control ya tiene una cita estructurada asociada',
    { code: 'CITA_CONTROL_ORIGEN_EXISTENTE' }
  );
}

function resolverCitaProgramadaInequivoca(citas) {
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

function buildUpdateData(body) {
  const data = withGuatemalaTimeFallback(body, { onlyWhenHoraIsPresent: true });
  const campos = CONTROL_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(data, field));
  const normalized = {};

  for (const field of campos) {
    normalized[field] = ['torch_resultado_valor', 'papanicolau_ivaa_fecha_toma'].includes(field)
      ? null
      : emptyToNull(data[field]);
  }

  return { data: normalized, campos };
}

function normalizeCreateValue(field, body) {
  if (CONTROL_BOOLEAN_DEFAULT_FALSE.includes(field)) return body[field] ?? false;
  if (CONTROL_NULLABLE_BOOLEAN.includes(field)) return body[field] ?? null;
  if (['torch_resultado_valor', 'papanicolau_ivaa_fecha_toma'].includes(field)) return null;
  return emptyToNull(body[field]);
}

function buildCreateData({ pacienteId, embarazoId, body, usuarioId }) {
  const data = {
    paciente_id: pacienteId,
    embarazo_id: embarazoId,
  };

  for (const field of CONTROL_FIELDS) {
    data[field] = normalizeCreateValue(field, body);
  }

  data.registrado_por = usuarioId;
  data.updated_by = usuarioId;
  return data;
}

async function listarControles(pacienteId, embarazoIdSolicitado = null) {
  const embarazo = await resolverEmbarazoParaLectura({ pacienteId, embarazoId: embarazoIdSolicitado });
  return embarazo ? controlesRepository.listarPorEmbarazo(embarazo.id) : [];
}

async function obtenerControl({ pacienteId, embarazoId = null, id }) {
  const control = await controlesRepository.obtenerPorId(id);
  if (control) await resolverEmbarazoParaLectura({ pacienteId, embarazoId: control.embarazo_id });
  if (!control) throw new HttpError(404, 'Control no encontrado');
  if (embarazoId && String(control.embarazo_id) !== String(embarazoId)) {
    throw new HttpError(404, 'Control no encontrado en el embarazo seleccionado');
  }
  return control;
}

async function crearControl({ pacienteId, embarazoId, body, req }) {
  const dataWithTime = withGuatemalaTimeFallback(body);
  requerirEmbarazoId(embarazoId);
  return controlesRepository.enTransaccion(async (client) => {
    await validarEmbarazoActivo({ pacienteId, embarazoId, db: client, bloquear: true });
    const before = await controlesRepository.obtenerPorNumeroYEmbarazo(
      embarazoId,
      dataWithTime.numero_control,
      client
    );
    const data = buildCreateData({
      pacienteId,
      embarazoId,
      body: dataWithTime,
      usuarioId: req.usuario.id,
    });
    const updateFields = CONTROL_FIELDS.filter((field) =>
      field !== 'numero_control' &&
      (puedeVerVih(req.usuario.permisos) || !VIH_FIELDS.has(field))
    );
    const modifiedFields = before
      ? camposRealmenteModificados(before, data, updateFields)
      : updateFields;
    if (before && modifiedFields.length === 0) return before;
    if (before) impedirCambioHistoricoDeCita(modifiedFields);

    const citaVigente = before
      ? null
      : resolverCitaProgramadaInequivoca(
        await citasRepository.listarProgramadasVigentesPorEmbarazo(
          embarazoId,
          client,
          { bloquear: true }
        )
      );

    const control = await controlesRepository.upsert({
      data,
      updateFields: before ? modifiedFields : updateFields,
    }, client);
    if (!control) {
      await validarEmbarazoActivo({ pacienteId, embarazoId, db: client, bloquear: true });
      throw new HttpError(409, 'No fue posible guardar el control');
    }

    if (!before && citaVigente) {
      const citaAtendida = await citasRepository.marcarAtendida({
        citaId: citaVigente.id,
        embarazoId,
        controlCumplimientoId: control.id,
        usuarioId: req.usuario.id,
      }, client);
      if (!citaAtendida) {
        throw new HttpError(409, 'La cita vigente cambio durante el registro del control', {
          code: 'CITA_CUMPLIMIENTO_CONFLICTO',
        });
      }

      await registrarAuditoria(req, {
        contexto: AUDIT_CONTEXT.citaAtender,
        accion: 'actualizar',
        entidadId: citaVigente.id,
        pacienteId,
        embarazoId,
        cambios: {
          anteriores: {
            estado_cita: citaVigente.estado,
            control_cumplimiento_id: null,
          },
          nuevos: {
            estado_cita: citaAtendida.estado,
            control_cumplimiento_id: Number(control.id),
          },
        },
        metadata: { resultado: RESULTADO_EXITOSO, motivo_codigo: 'cita_atendida' },
      }, { db: client, obligatorio: true });
    }

    if (!before && data.cita_siguiente) {
      await citasRepository.crearProgramadaDesdeControl({
        embarazoId,
        controlOrigenId: control.id,
        fechaProgramada: data.cita_siguiente,
        usuarioId: req.usuario.id,
      }, client);
    }

    await registrarAuditoria(req, {
      contexto: before ? AUDIT_CONTEXT.actualizar : AUDIT_CONTEXT.crear,
      accion: before ? 'actualizar' : 'crear',
      entidadId: control.id,
      pacienteId,
      embarazoId,
      cambios: before
        ? {
          anteriores: seleccionarCamposAuditoria(before, modifiedFields),
          nuevos: seleccionarCamposAuditoria(control, modifiedFields),
        }
        : { nuevos: seleccionarCamposAuditoria(data, CONTROL_FIELDS) },
      metadata: { resultado: RESULTADO_EXITOSO },
    }, { db: client, obligatorio: true });

    return control;
  });
}

async function actualizarControl({ pacienteId, embarazoId, id, body, req }) {
  requerirEmbarazoId(embarazoId);
  const bodyPermitido = filtrarCamposVih(body, req.usuario.permisos);
  const { data, campos } = buildUpdateData(bodyPermitido);
  if (campos.length === 0) throw new HttpError(400, 'Sin campos para actualizar');
  return controlesRepository.enTransaccion(async (client) => {
    const controlSolicitado = await controlesRepository.obtenerPorId(id, client);
    if (!controlSolicitado) throw new HttpError(404, 'Control no encontrado');
    if (String(controlSolicitado.embarazo_id) !== String(embarazoId)) {
      throw new HttpError(404, 'Control no encontrado en el embarazo seleccionado');
    }
    await validarEmbarazoEditable({ pacienteId, embarazoId, db: client, bloquear: true });

    const before = await controlesRepository.obtenerPorId(id, client, { bloquear: true });
    if (!before || String(before.embarazo_id) !== String(embarazoId)) {
      throw new HttpError(404, 'Control no encontrado en el embarazo seleccionado');
    }

    const modifiedFields = camposRealmenteModificados(before, data, campos);
    if (modifiedFields.length === 0) return before;
    const transicionCita = resolverTransicionDeCita(
      before.cita_siguiente,
      data.cita_siguiente,
      modifiedFields
    );

    if (transicionCita === 'crear') {
      const existePosterior = await controlesRepository.existeControlPosterior({
        embarazoId,
        controlId: before.id,
        numeroControl: before.numero_control,
        fecha: before.fecha,
      }, client);
      if (existePosterior) throw controlHistoricoNoPuedeOriginarCita();

      const citaOriginada = await citasRepository.obtenerOriginadaPorControl(
        { controlId: before.id, embarazoId },
        client,
        { bloquear: true }
      );
      if (citaOriginada) throw citaOriginadaPorControlYaExiste();

      const citasVigentes = await citasRepository.listarProgramadasVigentesPorEmbarazo(
        embarazoId,
        client,
        { bloquear: true }
      );
      if (citasVigentes.length > 0) throw citaVigenteYaExiste();
    }

    const modifiedData = seleccionarCamposAuditoria(data, modifiedFields);
    const control = await controlesRepository.actualizar({
      id,
      embarazoId,
      data: modifiedData,
      campos: modifiedFields,
      updatedBy: req.usuario.id,
      pacienteId,
    }, client);

    if (!control) {
      await validarEmbarazoEditable({ pacienteId, embarazoId, db: client, bloquear: true });
      throw new HttpError(404, 'Control no encontrado');
    }

    let citaCreada = null;
    if (transicionCita === 'crear') {
      citaCreada = await citasRepository.crearProgramadaDesdeControl({
        embarazoId,
        controlOrigenId: control.id,
        fechaProgramada: control.cita_siguiente,
        usuarioId: req.usuario.id,
      }, client);
      if (!citaCreada) {
        throw new HttpError(409, 'No fue posible crear la cita prenatal', {
          code: 'CITA_CREACION_NO_REALIZADA',
        });
      }
    }

    await registrarAuditoria(req, {
      contexto: AUDIT_CONTEXT.actualizar,
      accion: 'actualizar',
      entidadId: control.id,
      pacienteId,
      embarazoId,
      cambios: {
        anteriores: seleccionarCamposAuditoria(before, modifiedFields),
        nuevos: seleccionarCamposAuditoria(control, modifiedFields),
      },
      metadata: { resultado: RESULTADO_EXITOSO },
    }, { db: client, obligatorio: true });

    if (citaCreada) {
      await registrarAuditoria(req, {
        contexto: AUDIT_CONTEXT.citaCrear,
        accion: 'crear',
        entidadId: citaCreada.id,
        pacienteId,
        embarazoId,
        cambios: {
          nuevos: {
            estado_cita: citaCreada.estado,
            fecha_programada: citaCreada.fecha_programada,
            control_origen_id: Number(control.id),
          },
        },
        metadata: { resultado: RESULTADO_EXITOSO, motivo_codigo: 'cita_agregada_desde_control' },
      }, { db: client, obligatorio: true });
    }

    return control;
  });
}

async function eliminarControl({ pacienteId, embarazoId, id, req }) {
  requerirEmbarazoId(embarazoId);
  return controlesRepository.enTransaccion(async (client) => {
    const before = await controlesRepository.obtenerPorId(id, client);
    if (!before) throw new HttpError(404, 'Control no encontrado');
    if (String(before.embarazo_id) !== String(embarazoId)) {
      throw new HttpError(404, 'Control no encontrado en el embarazo seleccionado');
    }
    await validarEmbarazoEditable({ pacienteId, embarazoId, db: client, bloquear: true });
    if (await citasRepository.existeRelacionConControl({ controlId: id, embarazoId }, client)) {
      throw new HttpError(
        409,
        'No se puede eliminar un control relacionado con una cita prenatal',
        { code: 'CONTROL_RELACIONADO_CON_CITA' }
      );
    }
    const { control, rowCount } = await controlesRepository.eliminar(
      { id, embarazoId, pacienteId },
      client
    );

    if (rowCount === 0) {
      await validarEmbarazoEditable({ pacienteId, embarazoId, db: client, bloquear: true });
      throw new HttpError(404, 'Control no encontrado');
    }

    await registrarAuditoria(req, {
      contexto: AUDIT_CONTEXT.eliminar,
      accion: 'eliminar',
      entidadId: id,
      pacienteId,
      embarazoId,
      cambios: {
        anteriores: seleccionarCamposAuditoria(control || before, CONTROL_FIELDS),
      },
      metadata: { resultado: RESULTADO_EXITOSO },
    }, { db: client, obligatorio: true });

    return { message: 'Control eliminado' };
  });
}

module.exports = {
  CONTROL_FIELDS,
  resolverCitaProgramadaInequivoca,
  resolverTransicionDeCita,
  valoresControlEquivalentes,
  listarControles,
  obtenerControl,
  crearControl,
  actualizarControl,
  eliminarControl,
};
