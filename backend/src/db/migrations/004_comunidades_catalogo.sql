CREATE TABLE IF NOT EXISTS comunidades (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  territorio SMALLINT NOT NULL CHECK (territorio BETWEEN 1 AND 4),
  sector CHAR(1) NOT NULL CHECK (sector IN ('A', 'B')),
  lat DECIMAL(10,7) NOT NULL,
  lng DECIMAL(10,7) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_comunidades_nombre
  ON comunidades (nombre);

INSERT INTO comunidades (nombre, territorio, sector, lat, lng) VALUES
('El Chal - Barrio El Paraiso',  1, 'A', 16.6413305, -89.6532061),
('El Chal - Barrio El Milagro',  1, 'A', 16.6437140, -89.6506727),
('El Chal - Barrio San Jose',    1, 'A', 16.6398064, -89.6487991),
('El Chal - Barrio San Carlos',  1, 'A', 16.6427232, -89.6459623),
('El Quetzal',                   1, 'A', 16.6405946, -89.6227465),
('El Pumpal',                    1, 'A', 16.6065883, -89.7420528),
('Colpeten',                     2, 'A', 16.6218176, -89.5774469),
('La Puente',                    2, 'A', 16.6239266, -89.5527262),
('Santa Cruz',                   2, 'A', 16.6707291, -89.5535994),
('San Juan',                     2, 'A', 16.6319576, -89.6052651),
('Santa Rosita',                 2, 'A', 16.5441646, -89.5837132),
('Nuevas Delicias',              2, 'B', 16.4928588, -89.6593942),
('La Lucha',                     2, 'B', 16.4520810, -89.6622162),
('Nuevo Paraiso La Machaca',     2, 'B', 16.4362489, -89.7393241),
('El Eden',                      2, 'B', 16.5020347, -89.6613821),
('Las Vegas',                    2, 'B', 16.4372110, -89.7381540),
('Grupo San Luis',               2, 'B', 16.4757422, -89.6190326),
('Poxte II',                     2, 'B', 16.4748152, -89.7336811),
('Cooperativa Las Flores',       3, 'A', 16.5524902, -89.7181597),
('Agricultores Unidos',          3, 'A', 16.5578381, -89.6663828),
('Cooperativa La Amistad',       3, 'A', 16.5502894, -89.7013798),
('El Esfuerzo',                  3, 'A', 16.5025075, -89.6837772),
('Kilometro 13',                 3, 'A', 16.5561570, -89.6798629),
('La Verde',                     3, 'A', 16.4989726, -89.7138009),
('Poxte I',                      3, 'B', 16.4555599, -89.7974020),
('Eben-Ezer',                    3, 'B', 16.5279709, -89.7923922),
('El Quetzalito',                3, 'B', 16.5347976, -89.7629436),
('San Rafael Amatitlan',         3, 'B', 16.4401001, -89.8170178),
('Santa Amelia',                 4, 'A', 16.4080343, -89.8948164),
('Mojarras I',                   4, 'A', 16.3899301, -89.9134063),
('Mojarras II',                  4, 'A', 16.3801059, -89.8741604),
('San Jorge',                    4, 'A', 16.3207152, -89.8800362),
('Sesaltul',                     4, 'A', 16.3794715, -89.8405779),
('Guacamayas I',                 4, 'A', 16.3577902, -89.8530546),
('Guacamayas II',                4, 'A', 16.3609375, -89.8279112),
('La Guadalupe',                 4, 'B', 16.5106962, -89.9100160),
('Las Rosas',                    4, 'B', 16.4542490, -89.9089697),
('Union Bayer',                  4, 'B', 16.4813219, -89.8432352),
('Finca Africa',                 4, 'B', 16.4530400, -89.8777100),
('La Oriental',                  4, 'B', 16.4654899, -89.9200571),
('Los Angeles',                  4, 'B', 16.4854540, -89.8905001)
ON CONFLICT (nombre) DO UPDATE SET
  territorio = EXCLUDED.territorio,
  sector = EXCLUDED.sector,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng;

ALTER TABLE pacientes
  ADD COLUMN IF NOT EXISTS comunidad_id INTEGER REFERENCES comunidades(id);

CREATE INDEX IF NOT EXISTS idx_pacientes_comunidad_id
  ON pacientes(comunidad_id);

UPDATE pacientes p
SET comunidad_id = c.id
FROM comunidades c
WHERE p.comunidad_id IS NULL
  AND TRIM(LOWER(p.comunidad)) = TRIM(LOWER(c.nombre));

CREATE TABLE IF NOT EXISTS comunidades_aliases (
  id SERIAL PRIMARY KEY,
  comunidad_id INTEGER NOT NULL REFERENCES comunidades(id) ON DELETE CASCADE,
  alias VARCHAR(150) NOT NULL,
  UNIQUE (comunidad_id, alias)
);

WITH aliases(nombre, alias) AS (
  VALUES
    ('El Chal - Barrio El Paraiso', 'El Paraiso'),
    ('El Chal - Barrio El Paraiso', 'Barrio El Paraiso'),
    ('El Chal - Barrio El Paraiso', 'Paraiso'),
    ('El Chal - Barrio El Milagro', 'El Milagro'),
    ('El Chal - Barrio El Milagro', 'Barrio El Milagro'),
    ('El Chal - Barrio San Jose', 'San Jose'),
    ('El Chal - Barrio San Jose', 'Barrio San Jose'),
    ('El Chal - Barrio San Carlos', 'San Carlos'),
    ('El Chal - Barrio San Carlos', 'Barrio San Carlos'),
    ('Nuevo Paraiso La Machaca', 'Nuevo Paraiso'),
    ('Nuevo Paraiso La Machaca', 'La Machaca'),
    ('Nuevo Paraiso La Machaca', 'Paraiso La Machaca'),
    ('Cooperativa Las Flores', 'Las Flores'),
    ('Cooperativa La Amistad', 'La Amistad'),
    ('San Rafael Amatitlan', 'San Rafael'),
    ('San Rafael Amatitlan', 'San Rafael Amatitlan'),
    ('Union Bayer', 'Union Bayer'),
    ('Finca Africa', 'Africa')
)
INSERT INTO comunidades_aliases (comunidad_id, alias)
SELECT c.id, a.alias
FROM aliases a
JOIN comunidades c ON c.nombre = a.nombre
ON CONFLICT (comunidad_id, alias) DO NOTHING;

WITH alias_match AS (
  SELECT DISTINCT ON (p.id)
    p.id AS paciente_id,
    ca.comunidad_id
  FROM pacientes p
  JOIN comunidades_aliases ca ON (
    regexp_replace(
      translate(LOWER(BTRIM(COALESCE(p.comunidad, ''))), 'áéíóúüñ', 'aeiouun'),
      '[^a-z0-9]+',
      '',
      'g'
    ) = regexp_replace(
      translate(LOWER(BTRIM(ca.alias)), 'áéíóúüñ', 'aeiouun'),
      '[^a-z0-9]+',
      '',
      'g'
    )
    OR regexp_replace(
      translate(LOWER(BTRIM(COALESCE(p.comunidad, ''))), 'áéíóúüñ', 'aeiouun'),
      '[^a-z0-9]+',
      '',
      'g'
    ) LIKE '%' || regexp_replace(
      translate(LOWER(BTRIM(ca.alias)), 'áéíóúüñ', 'aeiouun'),
      '[^a-z0-9]+',
      '',
      'g'
    ) || '%'
  )
  WHERE p.comunidad_id IS NULL
    AND COALESCE(BTRIM(p.comunidad), '') <> ''
  ORDER BY p.id, LENGTH(ca.alias) DESC
)
UPDATE pacientes p
SET comunidad_id = alias_match.comunidad_id
FROM alias_match
WHERE p.id = alias_match.paciente_id
  AND p.comunidad_id IS NULL;
