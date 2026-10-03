const { HttpError } = require('../utils/httpError');

const ESTABLECIMIENTO_CATALOGS = Object.freeze({
  nombre_establecimiento: Object.freeze([
    'CAP El Chal', 'P/S Colpetén', 'C/C Nuevas Delicias', 'P/S Las Flores', 'P/S Santa Amelia',
  ]),
  distrito: Object.freeze(['El Chal']),
  area_salud: Object.freeze(['Petén Sur Oriente']),
});

// Omitir campos sigue siendo válido para clientes existentes. Un valor enviado
// debe ser canónico; en edición solo se admite un legacy idéntico al almacenado.
function validarEstablecimientoPaciente(body, actual) {
  const validated = { ...body };
  for (const [field, values] of Object.entries(ESTABLECIMIENTO_CATALOGS)) {
    if (!Object.hasOwn(body, field) || body[field] === undefined) continue;
    if (actual && body[field] === actual[field]) {
      delete validated[field];
      continue;
    }
    if (!values.includes(body[field])) {
      throw new HttpError(400, 'Datos de entrada invalidos', {
        code: 'VALIDATION_ERROR',
        details: [{ campo: field, mensaje: 'Seleccione un valor del catálogo permitido' }],
      });
    }
  }
  return validated;
}

module.exports = { ESTABLECIMIENTO_CATALOGS, validarEstablecimientoPaciente };
