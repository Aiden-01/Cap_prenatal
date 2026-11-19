// Proyección territorial compartida para consultas con alias de pacientes p.
const nombreCatalogadoOTexto = 'com.nombre, p.comunidad';
const ubicacionPacienteSql = Object.freeze({
  join: 'LEFT JOIN comunidades com ON com.id = p.comunidad_id',
  comunidad: `COALESCE(${nombreCatalogadoOTexto})`,
  comunidadOTextoVacio: `COALESCE(${nombreCatalogadoOTexto}, '')`,
  territorio: 'COALESCE(com.territorio::text, p.territorio)',
  sector: 'COALESCE(com.sector::text, p.sector)',
});

module.exports = ubicacionPacienteSql;
