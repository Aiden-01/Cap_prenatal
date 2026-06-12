const pacientesRepository = require('../repositories/pacientesRepository');
const { registrarEvento: registrarAuditoria } = require('./auditService');
const { HttpError } = require('../utils/httpError');

const ESTADO_EMBARAZO_ACTIVO = 'activo';
const ESTADO_EMBARAZO_PUERPERIO = 'puerperio';
const ESTADO_EMBARAZO_CERRADO = 'cerrado';
const MENSAJE_EMBARAZO_ACTIVO_DUPLICADO = 'La paciente ya tiene un embarazo activo. Cierre o pase a puerperio el embarazo actual antes de crear otro.';

const emptyToNull = (value) => value === '' ? null : value;
const bool = (value) => value ?? false;
const num = (value, fallback = 0) => {
  if (value === '' || value === null || value === undefined) return fallback;
  return value;
};
const numOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const calcularEdadAnios = (fechaNacimiento) => {
  const value = emptyToNull(fechaNacimiento);
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const nacimiento = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(nacimiento.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const mes = hoy.getMonth() - nacimiento.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) edad -= 1;
  return edad;
};

const fechaNacimientoDesdeEdad = (edad) => {
  if (edad === null || edad === undefined || edad === '') return null;
  const parsed = Number(edad);
  if (Number.isNaN(parsed)) return null;
  const hoy = new Date();
  const fecha = new Date(hoy.getFullYear() - parsed, hoy.getMonth(), hoy.getDate());
  return fecha.toISOString().slice(0, 10);
};

const calcularFppDesdeFur = (fur) => {
  const value = emptyToNull(fur);
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const fecha = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(fecha.getTime())) return null;
  fecha.setUTCDate(fecha.getUTCDate() + 280);
  return fecha.toISOString().slice(0, 10);
};

const fppOrCalculated = (fur, fpp) => emptyToNull(fpp) || calcularFppDesdeFur(fur);
const normalizeCui = (value) => {
  const clean = emptyToNull(value);
  return clean ? String(clean).trim() : null;
};

async function validarPuedeActivarEmbarazo(pacienteId, embarazoIdExcluir = null) {
  const tieneActivo = await pacientesRepository.existeEmbarazoActivo(pacienteId, embarazoIdExcluir);
  if (tieneActivo) {
    throw new HttpError(409, MENSAJE_EMBARAZO_ACTIVO_DUPLICADO, {
      code: 'ACTIVE_PREGNANCY_EXISTS',
    });
  }
}

function buildPacienteInsertData(d, usuarioId) {
  const fpp = fppOrCalculated(d.fur, d.fpp);
  const edadManual = numOrNull(d.edad_manual) ?? calcularEdadAnios(d.fecha_nacimiento);
  const fechaNacimiento = emptyToNull(d.fecha_nacimiento) || fechaNacimientoDesdeEdad(edadManual);

  return {
    no_expediente: d.no_expediente,
    cui: normalizeCui(d.cui),
    nombre_establecimiento: emptyToNull(d.nombre_establecimiento),
    distrito: emptyToNull(d.distrito),
    area_salud: emptyToNull(d.area_salud),
    categoria_servicio: emptyToNull(d.categoria_servicio),
    nombres: d.nombres,
    apellidos: d.apellidos,
    fecha_nacimiento: fechaNacimiento,
    edad_manual: edadManual,
    edad_calculada: emptyToNull(d.edad_calculada),
    rango_edad: emptyToNull(d.rango_edad),
    clasificacion_alfa_beta: emptyToNull(d.clasificacion_alfa_beta),
    domicilio: emptyToNull(d.domicilio),
    municipio: emptyToNull(d.municipio),
    territorio: emptyToNull(d.territorio),
    sector: emptyToNull(d.sector),
    comunidad: emptyToNull(d.comunidad),
    telefono: emptyToNull(d.telefono),
    cobertura_igss: bool(d.cobertura_igss),
    cobertura_privada: bool(d.cobertura_privada),
    cobertura_privada_detalle: emptyToNull(d.cobertura_privada_detalle),
    viene_referida: bool(d.viene_referida),
    referida_de: emptyToNull(d.referida_de),
    nivel_estudios: emptyToNull(d.nivel_estudios),
    ultimo_anio_aprobado: emptyToNull(d.ultimo_anio_aprobado),
    profesion_oficio: emptyToNull(d.profesion_oficio),
    estado_civil: emptyToNull(d.estado_civil),
    vive_sola: bool(d.vive_sola),
    nombre_esposo_conviviente: emptyToNull(d.nombre_esposo_conviviente),
    es_migrante: bool(d.es_migrante),
    migrante_municipio_depto_pais: emptyToNull(d.migrante_municipio_depto_pais),
    pueblo: emptyToNull(d.pueblo),
    comunidad_linguistica: emptyToNull(d.comunidad_linguistica),
    fuma_activamente: bool(d.fuma_activamente),
    fuma_pasivamente: bool(d.fuma_pasivamente),
    consume_drogas: bool(d.consume_drogas),
    consume_alcohol: bool(d.consume_alcohol),
    fuma_activamente_1er_trimestre: bool(d.fuma_activamente_1er_trimestre),
    fuma_activamente_2do_trimestre: bool(d.fuma_activamente_2do_trimestre),
    fuma_activamente_3er_trimestre: bool(d.fuma_activamente_3er_trimestre),
    fuma_pasivamente_1er_trimestre: bool(d.fuma_pasivamente_1er_trimestre),
    fuma_pasivamente_2do_trimestre: bool(d.fuma_pasivamente_2do_trimestre),
    fuma_pasivamente_3er_trimestre: bool(d.fuma_pasivamente_3er_trimestre),
    consume_alcohol_1er_trimestre: bool(d.consume_alcohol_1er_trimestre),
    consume_alcohol_2do_trimestre: bool(d.consume_alcohol_2do_trimestre),
    consume_alcohol_3er_trimestre: bool(d.consume_alcohol_3er_trimestre),
    consume_drogas_1er_trimestre: bool(d.consume_drogas_1er_trimestre),
    consume_drogas_2do_trimestre: bool(d.consume_drogas_2do_trimestre),
    consume_drogas_3er_trimestre: bool(d.consume_drogas_3er_trimestre),
    violencia_1er_trimestre: bool(d.violencia_1er_trimestre),
    violencia_2do_trimestre: bool(d.violencia_2do_trimestre),
    violencia_3er_trimestre: bool(d.violencia_3er_trimestre),
    embarazo_abuso_sexual: bool(d.embarazo_abuso_sexual),
    fur: emptyToNull(d.fur),
    fpp,
    eg_confiable_fur: bool(d.eg_confiable_fur),
    eg_confiable_usg: bool(d.eg_confiable_usg),
    gestas_previas: num(d.gestas_previas),
    abortos: num(d.abortos),
    partos: num(d.partos),
    partos_vaginales: num(d.partos_vaginales),
    cesareas: num(d.cesareas),
    nacidos_vivos: num(d.nacidos_vivos),
    nacidos_muertos: num(d.nacidos_muertos),
    hijos_viven: num(d.hijos_viven),
    muertos_antes_1sem: num(d.muertos_antes_1sem),
    muertos_despues_1sem: num(d.muertos_despues_1sem),
    cirugia_genito_urinaria: bool(d.cirugia_genito_urinaria),
    infertilidad: bool(d.infertilidad),
    fin_embarazo_anterior: emptyToNull(d.fin_embarazo_anterior),
    fin_embarazo_menos_1anio: bool(d.fin_embarazo_menos_1anio),
    embarazo_planeado: bool(d.embarazo_planeado),
    fracaso_metodo: emptyToNull(d.fracaso_metodo),
    rn_nc: bool(d.rn_nc),
    rn_normal: bool(d.rn_normal),
    rn_menor_2500g: bool(d.rn_menor_2500g),
    rn_mayor_4000g: bool(d.rn_mayor_4000g),
    antec_vih_positivo: bool(d.antec_vih_positivo),
    antec_emb_ectopico_num: num(d.antec_emb_ectopico_num),
    antec_emb_ectopico: bool(d.antec_emb_ectopico) || Number(d.antec_emb_ectopico_num || 0) > 0,
    antec_gemelares: bool(d.antec_gemelares),
    abortos_3_espont_consecutivos: bool(d.abortos_3_espont_consecutivos),
    antec_violencia: bool(d.antec_violencia),
    antec_diabetes: bool(d.antec_diabetes),
    antec_diabetes_tipo: emptyToNull(d.antec_diabetes_tipo),
    antec_tbc: bool(d.antec_tbc),
    antec_hipertension: bool(d.antec_hipertension),
    antec_preeclampsia: bool(d.antec_preeclampsia),
    antec_eclampsia: bool(d.antec_eclampsia),
    antec_cardiopatia: bool(d.antec_cardiopatia),
    antec_nefropatia: bool(d.antec_nefropatia),
    antec_otra_condicion: bool(d.antec_otra_condicion),
    antec_otra_condicion_desc: emptyToNull(d.antec_otra_condicion_desc),
    cirugia_genito_urinaria_pers: bool(d.cirugia_genito_urinaria_pers),
    fam_diabetes: bool(d.fam_diabetes),
    fam_tbc: bool(d.fam_tbc),
    fam_hipertension: bool(d.fam_hipertension),
    fam_preeclampsia: bool(d.fam_preeclampsia),
    fam_eclampsia: bool(d.fam_eclampsia),
    fam_cardiopatia: bool(d.fam_cardiopatia),
    fam_gemelos: bool(d.fam_gemelos),
    fam_otra_condicion_medica_grave: bool(d.fam_otra_condicion_medica_grave),
    tiene_ficha_riesgo: bool(d.tiene_ficha_riesgo),
    registrado_por: usuarioId,
  };
}

const PACIENTE_UPDATE_FIELDS = Object.keys(buildPacienteInsertData({}, null))
  .filter((campo) => campo !== 'registrado_por');

function buildPacienteUpdateData(data) {
  const normalized = { ...data };
  if (
    Object.prototype.hasOwnProperty.call(normalized, 'fur') &&
    !emptyToNull(normalized.fpp)
  ) {
    normalized.fpp = calcularFppDesdeFur(normalized.fur);
  }

  const campos = PACIENTE_UPDATE_FIELDS
    .filter((campo) => Object.prototype.hasOwnProperty.call(normalized, campo));

  const updateData = {};
  for (const campo of campos) {
    updateData[campo] = campo === 'cui' ? normalizeCui(normalized[campo]) : emptyToNull(normalized[campo]);
  }

  return { data: updateData, campos };
}

async function listarPacientes(query = {}) {
  const { buscar = '', pagina = 1, limite = 20 } = query;
  const paginaActual = Math.max(parseInt(pagina, 10) || 1, 1);
  const limiteActual = Math.min(Math.max(parseInt(limite, 10) || 20, 1), 100);
  const offset = (paginaActual - 1) * limiteActual;
  const q = `%${buscar}%`;

  const [data, total] = await Promise.all([
    pacientesRepository.listar({ q, limite: limiteActual, offset }),
    pacientesRepository.contar({ q }),
  ]);

  return { data, total };
}

async function obtenerPaciente(id) {
  const paciente = await pacientesRepository.obtenerPorId(id);
  if (!paciente) throw new HttpError(404, 'Paciente no encontrado');
  return paciente;
}

async function crearPaciente({ body, req }) {
  const cui = normalizeCui(body.cui);
  if (await pacientesRepository.existeCui(cui)) {
    throw new HttpError(409, 'Ya existe una paciente registrada con ese CUI');
  }

  const data = buildPacienteInsertData(body, req.usuario.id);
  const paciente = await pacientesRepository.insertarPaciente(data);
  await validarPuedeActivarEmbarazo(paciente.id);
  const embarazo = await pacientesRepository.crearEmbarazoInicial({
    pacienteId: paciente.id,
    fur: data.fur,
    fpp: data.fpp,
    usuarioId: req.usuario.id,
  });

  await registrarAuditoria(req, {
    accion: 'crear',
    tabla: 'pacientes',
    registroId: paciente.id,
    pacienteId: paciente.id,
    datosNuevos: paciente,
    descripcion: 'Paciente creada',
  });

  if (embarazo) {
    await registrarAuditoria(req, {
      accion: 'crear',
      tabla: 'embarazos',
      registroId: embarazo.id,
      pacienteId: paciente.id,
      embarazoId: embarazo.id,
      datosNuevos: embarazo,
      descripcion: 'Embarazo inicial creado automaticamente',
    });
  }

  return {
    id: paciente.id,
    no_expediente: paciente.no_expediente,
    cui: paciente.cui,
    nombres: paciente.nombres,
    apellidos: paciente.apellidos,
  };
}

async function actualizarPaciente({ id, body, req }) {
  const { data, campos } = buildPacienteUpdateData(body);
  if (campos.length === 0) throw new HttpError(400, 'Sin campos para actualizar');

  if (
    Object.prototype.hasOwnProperty.call(data, 'cui') &&
    await pacientesRepository.existeCui(data.cui, id)
  ) {
    throw new HttpError(409, 'Ya existe una paciente registrada con ese CUI');
  }

  const before = await pacientesRepository.obtenerPorId(id);
  const { paciente, rowCount } = await pacientesRepository.actualizarPaciente(id, data, campos);
  if (rowCount === 0) throw new HttpError(404, 'Paciente no encontrado');

  await registrarAuditoria(req, {
    accion: 'actualizar',
    tabla: 'pacientes',
    registroId: id,
    pacienteId: id,
    datosAnteriores: before,
    datosNuevos: paciente,
    descripcion: 'Paciente actualizada',
  });

  if (Object.prototype.hasOwnProperty.call(data, 'fur') || Object.prototype.hasOwnProperty.call(data, 'fpp')) {
    const embarazoId = await pacientesRepository.obtenerEmbarazoActivoId(id);
    if (embarazoId) {
      const embarazoBefore = await pacientesRepository.obtenerEmbarazoPorId(embarazoId);
      const embarazo = await pacientesRepository.actualizarEmbarazoFechas({
        embarazoId,
        fur: emptyToNull(data.fur),
        fpp: emptyToNull(data.fpp),
      });

      if (embarazo) {
        await registrarAuditoria(req, {
          accion: 'actualizar',
          tabla: 'embarazos',
          registroId: embarazoId,
          pacienteId: id,
          embarazoId,
          datosAnteriores: embarazoBefore,
          datosNuevos: embarazo,
          descripcion: 'Fechas de embarazo sincronizadas desde paciente',
        });
      }
    }
  }

  return { message: 'Paciente actualizado' };
}

async function expedienteCompleto(id) {
  let embarazoId = await pacientesRepository.obtenerEmbarazoVisibleId(id);
  if (!embarazoId) {
    await validarPuedeActivarEmbarazo(id);
    embarazoId = await pacientesRepository.crearEmbarazoDesdePaciente(id);
  }

  const expediente = await pacientesRepository.obtenerExpedienteCompleto(id, embarazoId);
  if (!expediente.paciente) throw new HttpError(404, 'Paciente no encontrado');
  return expediente;
}

async function obtenerCompletitudExpediente(pacienteId) {
  const data = await pacientesRepository.obtenerCompletitudExpediente(pacienteId);
  if (!data) throw new HttpError(404, 'No hay embarazo activo para calcular completitud');

  const totalControles = Number(data.total_controles || 0);
  const minimoControles = 4;
  const items = [
    {
      label: 'Ficha de riesgo',
      completado: Boolean(data.tiene_ficha_riesgo),
      ruta: `/pacientes/${pacienteId}?tab=riesgo`,
    },
    {
      label: 'Controles prenatales',
      completado: Boolean(data.tiene_controles),
      detalle: `${totalControles} controles registrados`,
      total_controles: totalControles,
      minimo_controles: minimoControles,
      ruta: `/pacientes/${pacienteId}?tab=controles`,
    },
    {
      label: 'Vacunas',
      completado: Boolean(data.tiene_vacunas),
      ruta: `/pacientes/${pacienteId}?tab=vacunas`,
    },
    {
      label: 'Plan de parto',
      completado: Boolean(data.tiene_plan_parto),
      ruta: `/pacientes/${pacienteId}?tab=plan`,
    },
    {
      label: 'Morbilidad',
      completado: Boolean(data.tiene_morbilidad),
      ruta: `/pacientes/${pacienteId}?tab=morbilidad`,
    },
  ];

  const completados = items.filter((item) => item.completado).length;
  return {
    porcentaje: completados * 20,
    embarazo_id: data.embarazo_id,
    total_controles: totalControles,
    items,
  };
}

async function nuevoEmbarazo({ id, body, req }) {
  const paciente = await pacientesRepository.obtenerPorId(id);
  if (!paciente) throw new HttpError(404, 'Paciente no encontrado');

  const fpp = fppOrCalculated(body.fur, body.fpp);
  const cerrados = await pacientesRepository.cerrarEmbarazosEnSeguimiento(id, emptyToNull(body.fecha_cierre));
  await validarPuedeActivarEmbarazo(id);
  const siguiente = await pacientesRepository.obtenerSiguienteNumeroEmbarazo(id);
  const embarazo = await pacientesRepository.insertarNuevoEmbarazo({
    pacienteId: id,
    numeroEmbarazo: siguiente,
    fur: emptyToNull(body.fur),
    fpp,
    observaciones: emptyToNull(body.observaciones),
    usuarioId: req.usuario.id,
  });
  const pacienteActualizado = await pacientesRepository.sincronizarPacienteConEmbarazo({
    pacienteId: id,
    fur: emptyToNull(body.fur),
    fpp,
  });

  for (const cerrado of cerrados) {
    await registrarAuditoria(req, {
      accion: 'estado',
      tabla: 'embarazos',
      registroId: cerrado.id,
      pacienteId: id,
      embarazoId: cerrado.id,
      datosNuevos: cerrado,
      descripcion: 'Embarazo anterior cerrado al iniciar nuevo embarazo',
    });
  }

  await registrarAuditoria(req, {
    accion: 'crear',
    tabla: 'embarazos',
    registroId: embarazo.id,
    pacienteId: id,
    embarazoId: embarazo.id,
    datosNuevos: embarazo,
    descripcion: 'Nuevo embarazo creado',
  });

  await registrarAuditoria(req, {
    accion: 'actualizar',
    tabla: 'pacientes',
    registroId: id,
    pacienteId: id,
    datosAnteriores: paciente,
    datosNuevos: pacienteActualizado,
    descripcion: 'Paciente sincronizada con nuevo embarazo',
  });

  return embarazo;
}

async function pasarAPuerperio({ id, body, req }) {
  const before = await pacientesRepository.obtenerUltimoEmbarazoActivo(id);
  const embarazo = await pacientesRepository.pasarEmbarazoAPuerperio({
    pacienteId: id,
    fechaCierre: emptyToNull(body.fecha_parto || body.fecha_cierre),
    observaciones: emptyToNull(body.observaciones),
  });

  if (!embarazo) {
    throw new HttpError(409, 'La paciente no tiene un embarazo activo para pasar a puerperio');
  }

  await registrarAuditoria(req, {
    accion: 'estado',
    tabla: 'embarazos',
    registroId: embarazo.id,
    pacienteId: id,
    embarazoId: embarazo.id,
    datosAnteriores: before,
    datosNuevos: embarazo,
    descripcion: 'Embarazo pasado a puerperio',
  });

  return embarazo;
}

async function cerrarEmbarazo({ id, body, req }) {
  const before = await pacientesRepository.obtenerUltimoEmbarazoEnSeguimiento(id);
  const embarazo = await pacientesRepository.cerrarEmbarazoEnSeguimiento({
    pacienteId: id,
    fechaCierre: emptyToNull(body.fecha_cierre),
    observaciones: emptyToNull(body.observaciones),
  });

  if (!embarazo) {
    throw new HttpError(409, 'La paciente no tiene un embarazo activo o en puerperio para cerrar');
  }

  await registrarAuditoria(req, {
    accion: 'estado',
    tabla: 'embarazos',
    registroId: embarazo.id,
    pacienteId: id,
    embarazoId: embarazo.id,
    datosAnteriores: before,
    datosNuevos: embarazo,
    descripcion: 'Embarazo cerrado',
  });

  return embarazo;
}

module.exports = {
  ESTADO_EMBARAZO_ACTIVO,
  ESTADO_EMBARAZO_PUERPERIO,
  ESTADO_EMBARAZO_CERRADO,
  listarPacientes,
  obtenerPaciente,
  crearPaciente,
  actualizarPaciente,
  expedienteCompleto,
  obtenerCompletitudExpediente,
  nuevoEmbarazo,
  pasarAPuerperio,
  cerrarEmbarazo,
};
