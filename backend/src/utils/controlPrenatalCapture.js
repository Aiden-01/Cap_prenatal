const { HttpError } = require('./httpError');

// These are capture labels, not inferred diagnoses or verified authorship.
const SITUACIONES_FETALES = Object.freeze(['Longitudinal', 'Transversa', 'Oblicua', 'No determinada']);
const PRESENTACIONES_FETALES = Object.freeze(['Cefálica', 'Pélvica/podálica', 'Hombro', 'Cara', 'Frente', 'Compuesta', 'No determinada']);
const FETAL_OPTIONS = Object.freeze({ situacion_fetal: SITUACIONES_FETALES, presentacion_fetal: PRESENTACIONES_FETALES });
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const empty = value => value === '' || value === null || value === undefined;

function invalid(field, message) {
  return new HttpError(400, message, { code: 'CAPTURA_CONTROL_INVALIDA', details: [{ campo: field, mensaje: message }] });
}

async function prepararCapturaControl({ body, before = null, db, obtenerCargo }) {
  if (has(body, 'cargo_atiende_snapshot')) throw invalid('cargo_atiende_snapshot', 'El cargo histórico es administrado por el servidor');
  const result = {};
  for (const [field, options] of Object.entries(FETAL_OPTIONS)) {
    if (!has(body, field)) {
      if (before) result[field] = before[field] ?? null;
      continue;
    }
    const value = empty(body[field]) ? null : body[field];
    if (value !== null && !options.includes(value) && !(before && value === before[field])) {
      throw invalid(field, 'Selecciona una opción fetal válida o deja el campo sin evaluar');
    }
    result[field] = value;
  }
  if (has(body, 'nombre_atiende')) {
    if (!empty(body.nombre_atiende) && (typeof body.nombre_atiende !== 'string' || body.nombre_atiende.length > 150)) {
      throw invalid('nombre_atiende', 'El nombre debe tener como máximo 150 caracteres');
    }
    result.nombre_atiende = empty(body.nombre_atiende) ? null : body.nombre_atiende.trim() || null;
  } else if (before) result.nombre_atiende = before.nombre_atiende ?? null;
  if (has(body, 'cargo_atiende_id')) {
    const value = body.cargo_atiende_id;
    if (empty(value)) {
      result.cargo_atiende_id = null;
      result.cargo_atiende_snapshot = null;
    } else {
      if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) > 2147483647) {
        throw invalid('cargo_atiende_id', 'Selecciona un cargo del catálogo');
      }
      const id = Number(value);
      result.cargo_atiende_id = id;
      if (before && Number(before.cargo_atiende_id) === id && before.cargo_atiende_snapshot) {
        // Preserve the declared historical label even after a rename/inactivation.
        result.cargo_atiende_snapshot = before.cargo_atiende_snapshot;
      } else {
        const cargo = await obtenerCargo(id, db);
        if (!cargo || !cargo.activo) throw invalid('cargo_atiende_id', 'Selecciona un cargo existente y activo');
        result.cargo_atiende_snapshot = { id: cargo.id, nombre: cargo.nombre, codigo: cargo.codigo ?? null };
      }
    }
  } else if (before) {
    result.cargo_atiende_id = before.cargo_atiende_id ?? null;
    result.cargo_atiende_snapshot = before.cargo_atiende_snapshot ?? null;
  }
  // Do not parse, infer, migrate or clear the old combined text on partial/upsert updates.
  if (before && !has(body, 'nombre_cargo_atiende')) result.nombre_cargo_atiende = before.nombre_cargo_atiende ?? null;
  return result;
}

module.exports = { SITUACIONES_FETALES, PRESENTACIONES_FETALES, prepararCapturaControl };
