const {
  optionalInt,
  optionalText,
  z,
  requiredInt,
  requiredText,
} = require('./common.schemas');

const emptyToUndefined = (value) => (value === '' || value === null ? undefined : value);

function requiredNumber(min, max, label) {
  return z.preprocess(
    emptyToUndefined,
    z.coerce.number({ error: 'Campo requerido' })
      .finite(`${label} debe ser numerico`)
      .min(min, `${label} debe ser mayor o igual a ${min}`)
      .max(max, `${label} debe ser menor o igual a ${max}`)
  );
}

const sectorSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
  z.enum(['A', 'B'], { error: 'Sector debe ser A o B' })
);

const comunidadSchema = z.object({
  nombre: requiredText(150),
  territorio: requiredInt(1, 4),
  sector: sectorSchema,
  lat: requiredNumber(-90, 90, 'Latitud'),
  lng: requiredNumber(-180, 180, 'Longitud'),
});

const comunidadListQuerySchema = z.object({
  buscar: optionalText(100),
  estado: z.enum(['activas', 'inactivas', 'todas']).optional(),
  territorio: z.enum(['todos', '1', '2', '3', '4']).optional(),
  sector: z.enum(['todos', 'A', 'B']).optional(),
  pagina: optionalInt(1, 100000),
  limite: optionalInt(1, 100),
}).passthrough();

module.exports = {
  comunidadListQuerySchema,
  comunidadSchema,
};
