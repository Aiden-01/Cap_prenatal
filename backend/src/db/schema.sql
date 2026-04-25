-- ============================================================
-- SISTEMA DE EXPEDIENTES CLÍNICOS PRENATALES - CAP EL CHAL
-- Schema completo v1.0
-- ============================================================

-- Extensión para UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- AUTENTICACIÓN
-- ============================================================

CREATE TABLE IF NOT EXISTS roles (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(50) UNIQUE NOT NULL, -- 'admin' | 'personal_salud'
  descripcion TEXT
);

CREATE TABLE IF NOT EXISTS usuarios (
  id              SERIAL PRIMARY KEY,
  nombre_completo VARCHAR(150) NOT NULL,
  username        VARCHAR(80)  UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  rol_id          INTEGER NOT NULL REFERENCES roles(id),
  activo          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MÓDULO 1 — REGISTRO DE PACIENTES (Ficha Primera Consulta)
-- Basado en: FICHA CLINICA PRIMERA CONSULTA (Forma-actu-14052020)
-- ============================================================

CREATE TABLE IF NOT EXISTS pacientes (
  id                      SERIAL PRIMARY KEY,

  -- Identificación del servicio
  nombre_servicio_salud   VARCHAR(150),
  area_salud              VARCHAR(150),

  -- Datos generales
  no_historia_clinica     VARCHAR(30) UNIQUE NOT NULL, -- DPI sugerido como registro
  nombre                  VARCHAR(200) NOT NULL,
  edad                    INTEGER,
  lugar_residencia        VARCHAR(255),
  grupo_etnico            VARCHAR(80),
  poblacion_migrante      BOOLEAN DEFAULT FALSE,

  -- Motivo de consulta e historia
  motivo_consulta         TEXT,
  historia_problema_actual TEXT,

  -- Antecedentes gineco-obstétricos
  fur                     DATE,
  no_embarazos            INTEGER DEFAULT 0,
  fecha_ultimo_embarazo   DATE,
  no_partos_eutocicos     INTEGER DEFAULT 0,
  no_partos_distocicos    INTEGER DEFAULT 0,
  no_abortos              INTEGER DEFAULT 0,
  no_cesarea              INTEGER DEFAULT 0,
  muerte_fetal_neonatal   INTEGER DEFAULT 0,
  ninos_nacidos_antes_8m  BOOLEAN DEFAULT FALSE,
  ultimo_rn_menor_5lbs    BOOLEAN DEFAULT FALSE,
  ultimo_rn_mayor_9lbs    BOOLEAN DEFAULT FALSE,
  embarazos_multiples     BOOLEAN DEFAULT FALSE,
  incompatibilidad_sanguinea BOOLEAN DEFAULT FALSE,

  -- Antecedentes patológicos
  tuberculosis            BOOLEAN DEFAULT FALSE,
  cancer                  BOOLEAN DEFAULT FALSE,
  asma_bronquial          BOOLEAN DEFAULT FALSE,
  diabetes                BOOLEAN DEFAULT FALSE,
  hipertension_arterial   BOOLEAN DEFAULT FALSE,
  cardiopatia             BOOLEAN DEFAULT FALSE,
  its_vih_sida            BOOLEAN DEFAULT FALSE,
  nefropatia              BOOLEAN DEFAULT FALSE,
  infecciones_urinarias   BOOLEAN DEFAULT FALSE,
  enfermedad_mental       BOOLEAN DEFAULT FALSE,
  chagas                  BOOLEAN DEFAULT FALSE,
  sifilis_positivo        BOOLEAN DEFAULT FALSE,

  -- Quirúrgicos
  no_legrados_uterinos    INTEGER DEFAULT 0,
  no_cesareas_previas     INTEGER DEFAULT 0,
  otra_cirugia            VARCHAR(255),

  -- Hábitos
  fuma                    BOOLEAN DEFAULT FALSE,
  cigarros_dia            INTEGER DEFAULT 0,
  ingiere_alcohol         BOOLEAN DEFAULT FALSE,
  consume_drogas          BOOLEAN DEFAULT FALSE,
  vacuna_td               BOOLEAN DEFAULT FALSE,

  -- Papanicolaou
  papanicolaou_fecha      DATE,
  papanicolaou_resultado  VARCHAR(255),

  -- Medicamentos
  toma_medicamentos       TEXT,
  otros_antecedentes      TEXT,

  -- Signos vitales (primera consulta)
  pa_sistolica            INTEGER,
  pa_diastolica           INTEGER,
  temperatura             DECIMAL(4,1),
  peso_lbs                DECIMAL(6,2),
  talla_cm                DECIMAL(5,2),
  frecuencia_cardiaca     INTEGER,
  respiraciones           INTEGER,

  -- Examen general
  palidez                 VARCHAR(50),
  palma_manos             VARCHAR(50),
  conjuntivas             VARCHAR(50),
  unas                    VARCHAR(50),
  icteria                 VARCHAR(50),
  estado_animo            VARCHAR(80),
  estado_nutricional      VARCHAR(80),
  circunferencia_brazo_cm DECIMAL(4,1),
  imc                     DECIMAL(4,2),

  -- Examen ginecológico externo
  hemorragia_vaginal      BOOLEAN DEFAULT FALSE,
  papilomas               BOOLEAN DEFAULT FALSE,
  flujo_vaginal           BOOLEAN DEFAULT FALSE,
  herpes                  BOOLEAN DEFAULT FALSE,
  ulcera                  BOOLEAN DEFAULT FALSE,

  -- IC, Tx, Consejería, Plan
  impresion_clinica       TEXT,
  tratamiento             TEXT,
  consejeria              TEXT,
  plan_parto              TEXT,
  plan_emergencia         TEXT,
  cita_siguiente          DATE,
  personal_atendio        VARCHAR(150),

  -- Auditoría
  registrado_por          INTEGER REFERENCES usuarios(id),
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MÓDULO 2 — SEGUIMIENTO PRENATAL
-- Basado en: ATENCION PRENATAL pág 2 + SEGUIMIENTO pág 3
-- ============================================================

CREATE TABLE IF NOT EXISTS controles_prenatales (
  id                      SERIAL PRIMARY KEY,
  paciente_id             INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  numero_control          INTEGER NOT NULL CHECK (numero_control BETWEEN 1 AND 10),
  -- 1-4 son los controles estándar, 5-10 son "Otros"

  fecha                   DATE NOT NULL,

  -- Signos vitales
  temperatura             DECIMAL(4,1),
  respiraciones           INTEGER,
  pa_sistolica            INTEGER,
  pa_diastolica           INTEGER,
  pulso                   INTEGER,
  au_cm                   DECIMAL(4,1),   -- Altura uterina
  fcf                     INTEGER,         -- Frecuencia cardíaca fetal
  peso_kg                 DECIMAL(5,2),
  talla_cm                DECIMAL(5,2),
  circunferencia_brazo_cm DECIMAL(4,1),
  edad_embarazo_semanas   INTEGER,
  imc                     DECIMAL(4,2),

  -- IC, Tx, consejería
  impresion_clinica       TEXT,
  tratamiento             TEXT,
  consejeria              TEXT,            -- temas de la lista sugerida
  plan_parto              TEXT,
  plan_emergencia         TEXT,
  cita_siguiente          DATE,
  personal_atendio        VARCHAR(150),

  -- Auditoría
  registrado_por          INTEGER REFERENCES usuarios(id),
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (paciente_id, numero_control)
);

-- Plan de Parto (integrado en el Módulo 2, formulario independiente MSPAS)
CREATE TABLE IF NOT EXISTS planes_parto (
  id                              SERIAL PRIMARY KEY,
  paciente_id                     INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  fecha                           DATE NOT NULL,

  -- Datos generales
  nombre_conyuge                  VARCHAR(200),
  telefono                        VARCHAR(20),
  fecha_nacimiento                DATE,
  estado_civil                    VARCHAR(30),
  pueblo                          VARCHAR(30),   -- Maya/Xinca/Garífuna/Mestiza/Otro
  escolaridad                     VARCHAR(30),
  con_quien_vive                  VARCHAR(50),
  idioma                          VARCHAR(80),
  ha_tenido_atencion_prenatal     BOOLEAN DEFAULT FALSE,

  -- Obstétricos
  no_embarazos                    INTEGER,
  no_partos                       INTEGER,
  no_abortos                      INTEGER,
  no_hijos_vivos                  INTEGER,
  no_hijos_muertos                INTEGER,
  fur                             DATE,
  fecha_probable_parto            DATE,
  no_cesareas                     INTEGER,
  fecha_ultima_cesarea            DATE,
  edad_gestacional_semanas        INTEGER,

  -- Parto anterior atendido por
  parto_anterior_hospital         BOOLEAN DEFAULT FALSE,
  parto_anterior_caimi            BOOLEAN DEFAULT FALSE,
  parto_anterior_comadrona        BOOLEAN DEFAULT FALSE,
  parto_anterior_clinica_privada  BOOLEAN DEFAULT FALSE,
  parto_anterior_otro             VARCHAR(80),

  -- Signos de peligro (checkboxes)
  peligro_dolor_cabeza            BOOLEAN DEFAULT FALSE,
  peligro_vision_borrosa          BOOLEAN DEFAULT FALSE,
  peligro_embarazo_multiple       BOOLEAN DEFAULT FALSE,
  peligro_hemorragia_vaginal      BOOLEAN DEFAULT FALSE,
  peligro_edema_mi                BOOLEAN DEFAULT FALSE,
  peligro_nino_transverso         BOOLEAN DEFAULT FALSE,
  peligro_dolor_estomago          BOOLEAN DEFAULT FALSE,
  peligro_salida_liquidos         BOOLEAN DEFAULT FALSE,
  peligro_convulsiones            BOOLEAN DEFAULT FALSE,
  peligro_fiebre                  BOOLEAN DEFAULT FALSE,
  peligro_ausencia_mov_fetales    BOOLEAN DEFAULT FALSE,
  peligro_placenta_no_salia       BOOLEAN DEFAULT FALSE,

  -- Lugar elegido para la atención del parto
  posicion_parto                  VARCHAR(50),
  lugar_atencion_parto            VARCHAR(50),   -- CAP/CAIMI/Hospital/Clínica privada/Otro
  horas_distancia                 INTEGER,
  kms_servicio                    DECIMAL(6,2),
  casa_materna_cercana            BOOLEAN DEFAULT FALSE,
  usara_casa_materna              BOOLEAN DEFAULT FALSE,

  -- Traslado
  como_trasladara                 VARCHAR(80),
  quien_acompanara                VARCHAR(150),
  bebida_durante_parto            VARCHAR(150),
  bebida_despues_parto            VARCHAR(150),
  ropa_nino                       BOOLEAN DEFAULT FALSE,
  ropa_madre                      BOOLEAN DEFAULT FALSE,
  otros_articulos                 TEXT,
  lleva_dpi_madre                 BOOLEAN DEFAULT FALSE,
  lleva_dpi_conyuge               BOOLEAN DEFAULT FALSE,
  lleva_partida_nacimiento        BOOLEAN DEFAULT FALSE,

  -- Ahorro / comunicación
  cuenta_ahorro                   BOOLEAN DEFAULT FALSE,
  comunicado_comite               BOOLEAN DEFAULT FALSE,

  -- Cuidado de casa e hijos
  con_quien_hijos                 VARCHAR(80),
  quien_cuida_casa                VARCHAR(80),
  telefono_vehiculo               VARCHAR(20),

  -- Responsable activar plan
  responsable_activar             VARCHAR(80),
  nombre_activara_plan            VARCHAR(150),

  -- Firma/huella
  nombre_proveedor_salud          VARCHAR(150),

  -- Auditoría
  registrado_por                  INTEGER REFERENCES usuarios(id),
  created_at                      TIMESTAMPTZ DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ DEFAULT NOW()
);

-- Control post parto (parte final del formulario de seguimiento)
CREATE TABLE IF NOT EXISTS controles_post_parto (
  id                        SERIAL PRIMARY KEY,
  paciente_id               INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  numero_control            INTEGER NOT NULL CHECK (numero_control BETWEEN 1 AND 4),
  fecha                     DATE NOT NULL,

  temperatura               DECIMAL(4,1),
  pulso                     INTEGER,
  respiraciones             INTEGER,
  pa_sistolica              INTEGER,
  pa_diastolica             INTEGER,
  peso_kg                   DECIMAL(5,2),
  involucion_utero          VARCHAR(100),
  presencia_loquios         VARCHAR(100),
  senales_peligro_madre     TEXT,
  senales_peligro_rn        TEXT,
  diagnostico               TEXT,
  tratamiento               TEXT,
  consejeria                TEXT,
  sulfato_ferroso           BOOLEAN DEFAULT FALSE,
  acido_folico              BOOLEAN DEFAULT FALSE,
  cita_siguiente            DATE,
  personal_atendio          VARCHAR(150),

  -- Método planificación familiar
  metodo_planificacion      VARCHAR(150),
  metodo_usado_anteriormente VARCHAR(150),
  orientacion               TEXT,

  -- Auditoría
  registrado_por            INTEGER REFERENCES usuarios(id),
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MÓDULO 3 — FICHA DE RIESGO OBSTÉTRICO
-- Basado en: FICHA DE RIESGO OBSTETRICO (Forma-actu-12/05/2020)
-- 25 criterios con clasificación automática
-- ============================================================

CREATE TABLE IF NOT EXISTS fichas_riesgo_obstetrico (
  id                                SERIAL PRIMARY KEY,
  paciente_id                       INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  fecha                             DATE NOT NULL,

  -- Datos complementarios del formulario
  telefono                          VARCHAR(20),
  pueblo                            VARCHAR(30),
  migrante                          BOOLEAN DEFAULT FALSE,
  estado_civil                      VARCHAR(30),
  escolaridad                       VARCHAR(50),
  ocupacion                         VARCHAR(100),
  nombre_esposo_conviviente         VARCHAR(200),
  edad_esposo                       INTEGER,
  pueblo_esposo                     VARCHAR(30),
  escolaridad_esposo                VARCHAR(50),
  ocupacion_esposo                  VARCHAR(100),
  distancia_servicio_km             DECIMAL(6,2),
  tiempo_horas                      DECIMAL(4,1),
  fecha_ultima_regla                DATE,
  fecha_probable_parto              DATE,
  no_embarazos                      INTEGER,
  no_partos                         INTEGER,
  no_cesareas                       INTEGER,
  no_abortos                        INTEGER,
  no_hijos_vivos                    INTEGER,
  no_hijos_muertos                  INTEGER,
  edad_embarazo_semanas             INTEGER,

  -- ANTECEDENTES OBSTÉTRICOS (criterios 1-7)
  muerte_fetal_neonatal_previa      BOOLEAN DEFAULT FALSE,  -- 1
  abortos_espontaneos_3mas          BOOLEAN DEFAULT FALSE,  -- 2
  gestas_3mas                       BOOLEAN DEFAULT FALSE,  -- 3
  peso_ultimo_bebe_menor_2500g      BOOLEAN DEFAULT FALSE,  -- 4
  peso_ultimo_bebe_mayor_4500g      BOOLEAN DEFAULT FALSE,  -- 5
  antec_hipertension_preeclampsia   BOOLEAN DEFAULT FALSE,  -- 6
  cirugias_tracto_reproductivo      BOOLEAN DEFAULT FALSE,  -- 7

  -- EMBARAZO ACTUAL (criterios 8-19)
  embarazo_multiple                 BOOLEAN DEFAULT FALSE,  -- 8
  menor_20_anos                     BOOLEAN DEFAULT FALSE,  -- 9
  mayor_35_anos                     BOOLEAN DEFAULT FALSE,  -- 10
  paciente_rh_negativo              BOOLEAN DEFAULT FALSE,  -- 11
  hemorragia_vaginal                BOOLEAN DEFAULT FALSE,  -- 12
  vih_positivo_sifilis              BOOLEAN DEFAULT FALSE,  -- 13
  presion_diastolica_90mas          BOOLEAN DEFAULT FALSE,  -- 14
  anemia                            BOOLEAN DEFAULT FALSE,  -- 15
  desnutricion_obesidad             BOOLEAN DEFAULT FALSE,  -- 16
  dolor_abdominal                   BOOLEAN DEFAULT FALSE,  -- 17
  sintomatologia_urinaria           BOOLEAN DEFAULT FALSE,  -- 18
  ictericia                         BOOLEAN DEFAULT FALSE,  -- 19

  -- HISTORIA CLÍNICA GENERAL (criterios 20-25)
  diabetes                          BOOLEAN DEFAULT FALSE,  -- 20
  enfermedad_renal                  BOOLEAN DEFAULT FALSE,  -- 21
  enfermedad_corazon                BOOLEAN DEFAULT FALSE,  -- 22
  hipertension_arterial             BOOLEAN DEFAULT FALSE,  -- 23
  consumo_drogas_alcohol_tabaco     BOOLEAN DEFAULT FALSE,  -- 24
  otra_enfermedad_severa            BOOLEAN DEFAULT FALSE,  -- 25
  otra_enfermedad_descripcion       TEXT,

  -- Clasificación automática (calculada en backend)
  tiene_riesgo                      BOOLEAN GENERATED ALWAYS AS (
    muerte_fetal_neonatal_previa OR abortos_espontaneos_3mas OR gestas_3mas OR
    peso_ultimo_bebe_menor_2500g OR peso_ultimo_bebe_mayor_4500g OR
    antec_hipertension_preeclampsia OR cirugias_tracto_reproductivo OR
    embarazo_multiple OR menor_20_anos OR mayor_35_anos OR
    paciente_rh_negativo OR hemorragia_vaginal OR vih_positivo_sifilis OR
    presion_diastolica_90mas OR anemia OR desnutricion_obesidad OR
    dolor_abdominal OR sintomatologia_urinaria OR ictericia OR
    diabetes OR enfermedad_renal OR enfermedad_corazon OR
    hipertension_arterial OR consumo_drogas_alcohol_tabaco OR
    otra_enfermedad_severa
  ) STORED,

  referida_a                        VARCHAR(255),
  nombre_personal_atendio           VARCHAR(150),

  -- Auditoría
  registrado_por                    INTEGER REFERENCES usuarios(id),
  created_at                        TIMESTAMPTZ DEFAULT NOW(),
  updated_at                        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MÓDULO 4 — RESULTADOS DE LABORATORIO
-- Basado en: HOJA DE RESULTADO DE LABORATORIOS DE LA ATENCION PRENATAL
-- ============================================================

CREATE TABLE IF NOT EXISTS resultados_laboratorio (
  id              SERIAL PRIMARY KEY,
  paciente_id     INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  control_id      INTEGER REFERENCES controles_prenatales(id) ON DELETE SET NULL,
  numero_control  INTEGER NOT NULL CHECK (numero_control BETWEEN 1 AND 4),

  -- PRIMER CONTROL
  orina_1         VARCHAR(255),
  heces_1         VARCHAR(255),
  hematologia_1   VARCHAR(255),
  glicemia_ayunas_1 VARCHAR(255),
  grupo_rh_1      VARCHAR(50),
  vdrl_rpr_1      VARCHAR(255),
  resultado_vih_1 VARCHAR(255),
  hepatitis_b_1   VARCHAR(255),
  papanicolaou_ivaa_1 VARCHAR(255),
  torch_1         VARCHAR(255),

  -- SEGUNDO CONTROL
  orina_2         VARCHAR(255),
  glicemia_ayunas_2 VARCHAR(255),
  oferta_vih_2    VARCHAR(255),
  vdrl_rpr_2      VARCHAR(255),
  hepatitis_b_2   VARCHAR(255),

  -- TERCER CONTROL
  hematologia_3   VARCHAR(255),
  orina_3         VARCHAR(255),
  glicemia_ayunas_3 VARCHAR(255),

  -- CUARTO CONTROL
  orina_4         VARCHAR(255),
  glicemia_ayunas_4 VARCHAR(255),
  oferta_vih_4    VARCHAR(255),
  vdrl_rpr_4      VARCHAR(255),
  hepatitis_b_4   VARCHAR(255),

  -- Auditoría
  registrado_por  INTEGER REFERENCES usuarios(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (paciente_id, numero_control)
);

-- ============================================================
-- MÓDULO 5 — MICRONUTRIENTES E INMUNIZACIONES
-- Basado en: Carné prenatal págs. 4, 5 y 6 (datos clínicos relevantes)
-- ============================================================

CREATE TABLE IF NOT EXISTS micronutrientes (
  id              SERIAL PRIMARY KEY,
  paciente_id     INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  acido_folico_cantidad  INTEGER,
  sulfato_ferroso_cantidad INTEGER,
  fecha           DATE,
  registrado_por  INTEGER REFERENCES usuarios(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inmunizaciones (
  id              SERIAL PRIMARY KEY,
  paciente_id     INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  vacuna          VARCHAR(80) NOT NULL,  -- TD / TdaP / INFLUENZA
  fecha_aplicacion DATE NOT NULL,
  registrado_por  INTEGER REFERENCES usuarios(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES PARA PERFORMANCE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_pacientes_historia ON pacientes(no_historia_clinica);
CREATE INDEX IF NOT EXISTS idx_pacientes_nombre ON pacientes(nombre);
CREATE INDEX IF NOT EXISTS idx_controles_paciente ON controles_prenatales(paciente_id);
CREATE INDEX IF NOT EXISTS idx_riesgo_paciente ON fichas_riesgo_obstetrico(paciente_id);
CREATE INDEX IF NOT EXISTS idx_labs_paciente ON resultados_laboratorio(paciente_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_username ON usuarios(username);
