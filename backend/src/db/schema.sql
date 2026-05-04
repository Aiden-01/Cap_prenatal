-- ============================================================
-- SISTEMA DE EXPEDIENTES CLÍNICOS PRENATALES - CAP EL CHAL
-- Schema completo v2.0
-- Basado en: Ficha Clínica Prenatal y Puerperio MSPAS
--            (Programa Nacional de Salud Reproductiva)
-- Autor tesis: Hugo Yondani Corado Hernández (690-21-10427)
-- UMG — Facultad de Ingeniería en Sistemas
-- ============================================================

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
-- MÓDULO 1 — DATOS GENERALES DE LA PACIENTE
-- Página 1-4 de la Ficha Clínica Prenatal y Puerperio MSPAS
-- Separación clara: no_expediente (del servicio) vs cui (DPI persona)
-- ============================================================

CREATE TABLE IF NOT EXISTS pacientes (
  id                        SERIAL PRIMARY KEY,

  -- ── Identificación del expediente y la persona ──────────────
  no_expediente             VARCHAR(30) UNIQUE NOT NULL, -- Número asignado por el servicio
  cui                       VARCHAR(13),                 -- DPI guatemalteco (13 dígitos)

  -- ── Datos del establecimiento ───────────────────────────────
  nombre_establecimiento    VARCHAR(150),
  distrito                  VARCHAR(100),
  area_salud                VARCHAR(150),
  -- Categoría del servicio: CCS | PS | CS_B | CS_A
  categoria_servicio        VARCHAR(10) CHECK (categoria_servicio IN ('CCS','PS','CS_B','CS_A','CAP')),

  -- ── Datos de la embarazada ───────────────────────────────────
  nombres                   VARCHAR(150) NOT NULL,
  apellidos                 VARCHAR(150) NOT NULL,
  fecha_nacimiento          DATE,
  -- Clasificación edad al momento del registro (calculada en backend, guardada para histórico)
  rango_edad                VARCHAR(10) CHECK (rango_edad IN ('menor_14','14_19','20_35','mayor_35')),
  -- Alfa/Beta (sistema clasificación interna MSPAS)
  clasificacion_alfa_beta   VARCHAR(5)  CHECK (clasificacion_alfa_beta IN ('SI','NO','ALFA','BETA')),

  domicilio                 VARCHAR(255),
  municipio                 VARCHAR(100),
  territorio                VARCHAR(100),
  sector                    VARCHAR(80),
  comunidad                 VARCHAR(100),
  telefono                  VARCHAR(20),

  -- Cobertura
  cobertura_igss            BOOLEAN DEFAULT FALSE,
  cobertura_privada         BOOLEAN DEFAULT FALSE,
  cobertura_privada_detalle VARCHAR(100),

  -- Referencia
  viene_referida            BOOLEAN DEFAULT FALSE,
  referida_de               VARCHAR(150),

  -- Estudios y situación personal
  -- Nivel: ninguno | primaria | secundaria | universitaria
  nivel_estudios            VARCHAR(20) CHECK (nivel_estudios IN ('ninguno','primaria','basico','diversificado','universitaria','secundaria')),
  ultimo_anio_aprobado      INTEGER,
  profesion_oficio          VARCHAR(100),

  -- Estado civil: casada | unida | soltera | separada | vive_sola
  estado_civil              VARCHAR(15) CHECK (estado_civil IN ('casada','unida','soltera','separada','vive_sola')),
  vive_sola                 BOOLEAN DEFAULT FALSE,

  nombre_esposo_conviviente VARCHAR(200),

  -- Migración
  es_migrante               BOOLEAN DEFAULT FALSE,
  migrante_municipio_depto_pais VARCHAR(150),

  -- Identidad étnica: maya | garifuna | xinca | mestizo | otro
  pueblo                    VARCHAR(15) CHECK (pueblo IN ('maya','garifuna','xinca','mestizo','otro')),
  comunidad_linguistica     VARCHAR(80),

  -- ── Hábitos / factores de riesgo social ─────────────────────
  fuma_activamente          BOOLEAN DEFAULT FALSE,
  fuma_pasivamente          BOOLEAN DEFAULT FALSE,
  consume_drogas            BOOLEAN DEFAULT FALSE,
  consume_alcohol           BOOLEAN DEFAULT FALSE,
  fuma_activamente_1er_trimestre BOOLEAN DEFAULT FALSE,
  fuma_activamente_2do_trimestre BOOLEAN DEFAULT FALSE,
  fuma_activamente_3er_trimestre BOOLEAN DEFAULT FALSE,
  fuma_pasivamente_1er_trimestre BOOLEAN DEFAULT FALSE,
  fuma_pasivamente_2do_trimestre BOOLEAN DEFAULT FALSE,
  fuma_pasivamente_3er_trimestre BOOLEAN DEFAULT FALSE,
  consume_alcohol_1er_trimestre  BOOLEAN DEFAULT FALSE,
  consume_alcohol_2do_trimestre  BOOLEAN DEFAULT FALSE,
  consume_alcohol_3er_trimestre  BOOLEAN DEFAULT FALSE,
  consume_drogas_1er_trimestre   BOOLEAN DEFAULT FALSE,
  consume_drogas_2do_trimestre   BOOLEAN DEFAULT FALSE,
  consume_drogas_3er_trimestre   BOOLEAN DEFAULT FALSE,

  -- Violencia (desglosada por trimestre según nueva ficha)
  violencia_1er_trimestre   BOOLEAN DEFAULT FALSE,
  violencia_2do_trimestre   BOOLEAN DEFAULT FALSE,
  violencia_3er_trimestre   BOOLEAN DEFAULT FALSE,

  -- Embarazo producto de abuso sexual
  embarazo_abuso_sexual     BOOLEAN DEFAULT FALSE,

  -- ── Gestación actual ────────────────────────────────────────
  fur                       DATE,                        -- Fecha Última Regla
  fpp                       DATE,                        -- Fecha Probable de Parto
  eg_confiable_fur          BOOLEAN DEFAULT FALSE,       -- EG confiable por FUR
  eg_confiable_usg          BOOLEAN DEFAULT FALSE,       -- EG confiable por USG

  -- ── Antecedentes obstétricos ─────────────────────────────────
  gestas_previas            INTEGER DEFAULT 0,
  abortos                   INTEGER DEFAULT 0,
  partos_vaginales          INTEGER DEFAULT 0,
  cesareas                  INTEGER DEFAULT 0,
  nacidos_vivos             INTEGER DEFAULT 0,
  nacidos_muertos           INTEGER DEFAULT 0,
  hijos_viven               INTEGER DEFAULT 0,
  muertos_antes_1sem        INTEGER DEFAULT 0,           -- muertos < 1 semana
  muertos_despues_1sem      INTEGER DEFAULT 0,           -- muertos > 1 semana
  cirugia_genito_urinaria   BOOLEAN DEFAULT FALSE,
  infertilidad              BOOLEAN DEFAULT FALSE,

  -- Último embarazo previo
  fin_embarazo_anterior     DATE,
  fin_embarazo_menos_1anio  BOOLEAN DEFAULT FALSE,

  -- Embarazo planeado / método anticonceptivo
  embarazo_planeado         BOOLEAN DEFAULT FALSE,
  -- Fracaso de método: no | barrera | hormonal | DIU | natural | emergencia
  fracaso_metodo            VARCHAR(15) CHECK (fracaso_metodo IN ('no','barrera','hormonal','DIU','natural','emergencia')),

  -- ── Antecedentes personales ──────────────────────────────────
  antec_diabetes            BOOLEAN DEFAULT FALSE,
  antec_diabetes_tipo       VARCHAR(1) CHECK (antec_diabetes_tipo IN ('1','2','G')),
  antec_tbc                 BOOLEAN DEFAULT FALSE,
  antec_hipertension        BOOLEAN DEFAULT FALSE,
  antec_preeclampsia        BOOLEAN DEFAULT FALSE,
  antec_eclampsia           BOOLEAN DEFAULT FALSE,
  antec_cardiopatia         BOOLEAN DEFAULT FALSE,
  antec_nefropatia          BOOLEAN DEFAULT FALSE,
  antec_otra_condicion      BOOLEAN DEFAULT FALSE,
  antec_otra_condicion_desc VARCHAR(200),
  cirugia_genito_urinaria_pers BOOLEAN DEFAULT FALSE,

  -- ── Antecedentes familiares ──────────────────────────────────
  fam_diabetes              BOOLEAN DEFAULT FALSE,
  fam_tbc                   BOOLEAN DEFAULT FALSE,
  fam_hipertension          BOOLEAN DEFAULT FALSE,
  fam_preeclampsia          BOOLEAN DEFAULT FALSE,
  fam_eclampsia             BOOLEAN DEFAULT FALSE,
  fam_cardiopatia           BOOLEAN DEFAULT FALSE,
  fam_gemelos               BOOLEAN DEFAULT FALSE,       -- Antecedente de gemelares
  fam_otra_condicion_medica_grave BOOLEAN DEFAULT FALSE,

  -- Peso neonatal previo
  rn_nc                     BOOLEAN DEFAULT FALSE,
  rn_normal                 BOOLEAN DEFAULT FALSE,
  rn_menor_2500g            BOOLEAN DEFAULT FALSE,
  rn_mayor_4000g            BOOLEAN DEFAULT FALSE,
  antec_vih_positivo        BOOLEAN DEFAULT FALSE,
  antec_emb_ectopico_num    INTEGER DEFAULT 0,
  antec_emb_ectopico        BOOLEAN DEFAULT FALSE,
  antec_gemelares           BOOLEAN DEFAULT FALSE,
  abortos_3_espont_consecutivos BOOLEAN DEFAULT FALSE,
  antec_violencia           BOOLEAN DEFAULT FALSE,

  -- ── Ficha de riesgo obstétrico ───────────────────────────────
  -- Referencia a si ya se llenó (el detalle está en tabla aparte)
  tiene_ficha_riesgo        BOOLEAN DEFAULT FALSE,

  -- ── Auditoría ────────────────────────────────────────────────
  registrado_por            INTEGER REFERENCES usuarios(id),
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MÓDULO 2 — VACUNAS
-- Página 1-4, sección Vacunas
-- Previo embarazo | Durante embarazo | Postparto/aborto
-- Vacunas: Td y Tdap | Influenza | SPR/SR
-- ============================================================

CREATE TABLE IF NOT EXISTS embarazos (
  id                SERIAL PRIMARY KEY,
  paciente_id       INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  numero_embarazo   INTEGER NOT NULL CHECK (numero_embarazo >= 1),
  estado            VARCHAR(15) NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','cerrado')),
  fur               DATE,
  fpp               DATE,
  fecha_inicio      DATE DEFAULT CURRENT_DATE,
  fecha_cierre      DATE,
  observaciones     TEXT,
  registrado_por    INTEGER REFERENCES usuarios(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (paciente_id, numero_embarazo)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_embarazo_activo_paciente
  ON embarazos(paciente_id)
  WHERE estado = 'activo';

CREATE TABLE IF NOT EXISTS vacunas_paciente (
  id              SERIAL PRIMARY KEY,
  paciente_id     INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  embarazo_id     INTEGER REFERENCES embarazos(id) ON DELETE CASCADE,

  -- Tipo: td_tdap | influenza | spr_sr
  tipo_vacuna     VARCHAR(20) NOT NULL CHECK (tipo_vacuna IN ('td_tdap','influenza','spr_sr')),

  -- Momento: previo_embarazo | durante_embarazo | postparto_aborto
  momento         VARCHAR(25) NOT NULL CHECK (momento IN ('previo_embarazo','durante_embarazo','postparto_aborto')),

  -- Dosis dentro del momento (primera, segunda, tercera para Td/Tdap)
  numero_dosis    INTEGER DEFAULT 1,
  fecha_dosis     DATE,

  registrado_por  INTEGER REFERENCES usuarios(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MÓDULO 3 — CONTROLES PRENATALES (Atenciones 1 a 4 + Otras)
-- Páginas 1-4, 2-4 y 3-4 de la ficha
-- Cada fila = una atención/control prenatal
-- ============================================================

CREATE TABLE IF NOT EXISTS controles_prenatales (
  id                        SERIAL PRIMARY KEY,
  paciente_id               INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  embarazo_id               INTEGER REFERENCES embarazos(id) ON DELETE CASCADE,
  -- 1-4 controles estándar MSPAS; 5+ son "otras atenciones"
  numero_control            INTEGER NOT NULL CHECK (numero_control >= 1),

  fecha                     DATE NOT NULL,
  hora                      TIME,

  motivo_consulta           TEXT,

  -- ── Signos de peligro (checklist triage) ────────────────────
  peligro_hemorragia_vaginal    BOOLEAN DEFAULT FALSE,
  peligro_palidez               BOOLEAN DEFAULT FALSE,
  peligro_dolor_cabeza          BOOLEAN DEFAULT FALSE,
  peligro_hipertension          BOOLEAN DEFAULT FALSE,
  peligro_dolor_epigastrico     BOOLEAN DEFAULT FALSE,
  peligro_trastornos_visuales   BOOLEAN DEFAULT FALSE,
  peligro_fiebre                BOOLEAN DEFAULT FALSE,
  peligro_otro                  VARCHAR(200),

  -- Edad gestacional al momento del control (semanas)
  edad_gestacional_semanas  INTEGER,
  nombre_acompanante        VARCHAR(150),
  nombre_cargo_atiende      VARCHAR(150),

  -- ── Examen físico (Página 2-4) ───────────────────────────────
  pa_sistolica              INTEGER,
  pa_diastolica             INTEGER,
  frecuencia_cardiaca       INTEGER,
  frecuencia_respiratoria   INTEGER,
  temperatura               DECIMAL(4,1),
  perimetro_braquial_cm     DECIMAL(4,1),     -- NUEVO en nueva ficha
  peso_kg                   DECIMAL(5,2),
  talla_cm                  DECIMAL(5,2),
  imc                       DECIMAL(4,2),
  examen_bucodental         BOOLEAN,          -- Si/No
  examen_mamas              BOOLEAN,          -- Si/No

  -- ── Examen obstétrico ────────────────────────────────────────
  altura_uterina_cm         DECIMAL(4,1),
  fcf                       INTEGER,           -- Frecuencia cardíaca fetal
  movimientos_fetales       BOOLEAN,
  situacion_fetal           VARCHAR(50),
  presentacion_fetal        VARCHAR(50),

  -- ── Examen ginecológico ──────────────────────────────────────
  sangre_manchado           BOOLEAN DEFAULT FALSE,
  verrugas_herpes_papilomas BOOLEAN DEFAULT FALSE,  -- NUEVO
  flujo_vaginal             BOOLEAN DEFAULT FALSE,
  otros_ginecologico        TEXT,

  -- ── Laboratorios (Página 2-4) ────────────────────────────────
  -- Hematología
  hematologia_realizada     BOOLEAN DEFAULT FALSE,
  hematologia_resultado     VARCHAR(100),

  -- Glicemia en ayunas
  glicemia_realizada        BOOLEAN DEFAULT FALSE,
  glicemia_resultado        VARCHAR(100),

  -- Grupo y RH
  grupo_rh_realizado        BOOLEAN DEFAULT FALSE,
  grupo_rh_resultado        VARCHAR(20),      -- ej: "O+" / "A-"

  -- Orina
  orina_realizada           BOOLEAN DEFAULT FALSE,
  orina_bacteriuria         BOOLEAN,
  orina_proteinuria         BOOLEAN,

  -- Heces
  heces_realizada           BOOLEAN DEFAULT FALSE,
  heces_resultado           VARCHAR(100),

  -- VIH
  vih_realizado             BOOLEAN DEFAULT FALSE,
  vih_resultado             VARCHAR(20),      -- positivo | negativo | no_aplica
  vih_resultado_valor       VARCHAR(50),

  -- VDRL/RPR
  vdrl_realizado            BOOLEAN DEFAULT FALSE,
  vdrl_resultado            VARCHAR(20),      -- positivo | negativo
  vdrl_tratamiento_indicado BOOLEAN DEFAULT FALSE,  -- MSPAS indica anotar si positivo

  -- TORCH
  torch_realizado           BOOLEAN DEFAULT FALSE,
  torch_resultado_positivo  BOOLEAN,
  torch_resultado_valor     VARCHAR(100),

  -- Papanicolau / IVAA
  papanicolau_ivaa_realizado  BOOLEAN DEFAULT FALSE,
  papanicolau_ivaa_fecha_toma DATE,                   -- Fecha toma de muestra (Carné pág.6)
  papanicolau_ivaa_resultado  VARCHAR(100),

  -- Hepatitis B
  hepatitis_b_realizado     BOOLEAN DEFAULT FALSE,
  hepatitis_b_resultado     VARCHAR(50),

  -- Otros laboratorios
  otros_lab                 TEXT,

  -- ── Estudios complementarios (USG) ──────────────────────────
  usg_realizado             BOOLEAN DEFAULT FALSE,
  usg_hallazgos             TEXT,

  -- ── Suplementación (Página 3-4) ──────────────────────────────
  sulfato_ferroso           BOOLEAN DEFAULT FALSE,
  sulfato_ferroso_tabletas  INTEGER,
  acido_folico              BOOLEAN DEFAULT FALSE,
  acido_folico_tabletas     INTEGER,
  suplementacion_hallazgos  TEXT,
  suplementacion_tratamiento TEXT,

  -- ── Orientaciones brindadas (Página 2-4, sección Orientaciones)
  orient_plan_emergencia_parto  BOOLEAN DEFAULT FALSE,
  orient_alimentacion_embarazo  BOOLEAN DEFAULT FALSE,
  orient_senales_peligro        BOOLEAN DEFAULT FALSE,
  orient_lactancia_materna      BOOLEAN DEFAULT FALSE,
  orient_planificacion_familiar BOOLEAN DEFAULT FALSE,
  orient_importancia_postparto  BOOLEAN DEFAULT FALSE,
  orient_vacunacion_nino        BOOLEAN DEFAULT FALSE,
  orient_pre_post_prueba_vih    BOOLEAN DEFAULT FALSE,
  orient_importancia_atenciones BOOLEAN DEFAULT FALSE,
  orient_tratamiento_its_pareja BOOLEAN DEFAULT FALSE,
  orient_otros                  TEXT,

  -- ── IC, Tx ───────────────────────────────────────────────────
  impresion_clinica         TEXT,
  tratamiento               TEXT,
  cita_siguiente            DATE,

  -- ── Auditoría ────────────────────────────────────────────────
  registrado_por            INTEGER REFERENCES usuarios(id),
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (paciente_id, numero_control)
);

-- ============================================================
-- MÓDULO 4 — MORBILIDAD DURANTE EL EMBARAZO
-- Página 3-4: consultas intercurrentes (2 registros en la ficha física)
-- En BD se guardan N registros por paciente
-- ============================================================

CREATE TABLE IF NOT EXISTS morbilidad_embarazo (
  id                        SERIAL PRIMARY KEY,
  paciente_id               INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  embarazo_id               INTEGER REFERENCES embarazos(id) ON DELETE CASCADE,

  fecha                     DATE NOT NULL,
  hora                      TIME,
  motivo_consulta           TEXT,
  historia_enfermedad_actual TEXT,
  revision_por_sistemas     TEXT,
  examen_fisico             TEXT,
  impresion_clinica         TEXT,
  tratamiento_referencia    TEXT,
  nombre_cargo_atiende      VARCHAR(150),

  registrado_por            INTEGER REFERENCES usuarios(id),
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MÓDULO 5 — PUERPERIO
-- Página 4-4: Primera y Segunda atención del puerperio
-- En BD se guardan como registros independientes (numero_atencion 1|2)
-- ============================================================

CREATE TABLE IF NOT EXISTS controles_puerperio (
  id                          SERIAL PRIMARY KEY,
  paciente_id                 INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  embarazo_id                 INTEGER REFERENCES embarazos(id) ON DELETE CASCADE,
  -- 1 = Primera atención, 2 = Segunda atención
  numero_atencion             INTEGER NOT NULL CHECK (numero_atencion IN (1, 2)),

  fecha                       DATE NOT NULL,
  hora                        TIME,

  -- ── Signos de peligro ────────────────────────────────────────
  signos_peligro              TEXT,  -- descripción libre si hay signos

  -- ── Datos del parto ──────────────────────────────────────────
  dias_despues_parto          INTEGER,
  lugar_atencion_parto        VARCHAR(150),
  quien_atendio_parto         VARCHAR(150),
  recien_nacido_vivo          BOOLEAN,
  -- Tipo: vaginal | cesarea | fórceps | otro
  tipo_parto                  VARCHAR(20) CHECK (tipo_parto IN ('vaginal','cesarea','forceps','otro')),
  tuvo_apego_inmediato        BOOLEAN,
  lactancia_materna_exclusiva BOOLEAN,
  herida_operatoria           VARCHAR(200),  -- descripción si aplica

  -- ── Signos vitales ───────────────────────────────────────────
  pa_sistolica                INTEGER,
  pa_diastolica               INTEGER,
  frecuencia_cardiaca         INTEGER,
  frecuencia_respiratoria     INTEGER,
  temperatura                 DECIMAL(4,1),

  -- ── Examen ───────────────────────────────────────────────────
  examen_mamas                TEXT,
  -- loquios, episiorrafía, hallazgos patológicos
  examen_ginecologico         TEXT,

  -- ── IC, Consejería, Tx ───────────────────────────────────────
  orientacion_consejeria      TEXT,
  impresion_clinica           TEXT,
  tratamiento                 TEXT,
  nombre_cargo_atiende        VARCHAR(150),

  -- ── Auditoría ────────────────────────────────────────────────
  registrado_por              INTEGER REFERENCES usuarios(id),
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (paciente_id, numero_atencion)
);

-- ============================================================
-- MÓDULO 6 — PLAN DE PARTO
-- Formulario independiente MSPAS (sin cambios estructurales)
-- ============================================================

CREATE TABLE IF NOT EXISTS planes_parto (
    id                              SERIAL PRIMARY KEY,
    paciente_id                     INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    embarazo_id                     INTEGER REFERENCES embarazos(id) ON DELETE CASCADE,
  fecha                           DATE NOT NULL,

  nombre_conyuge                  VARCHAR(200),
  telefono                        VARCHAR(20),
  fecha_nacimiento                DATE,
  estado_civil                    VARCHAR(30),
  pueblo                          VARCHAR(30),
  escolaridad                     VARCHAR(30),
  con_quien_vive                  VARCHAR(50),
  idioma                          VARCHAR(80),
  ha_tenido_atencion_prenatal     BOOLEAN DEFAULT FALSE,

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

  parto_anterior_hospital         BOOLEAN DEFAULT FALSE,
  parto_anterior_caimi            BOOLEAN DEFAULT FALSE,
  parto_anterior_comadrona        BOOLEAN DEFAULT FALSE,
  parto_anterior_clinica_privada  BOOLEAN DEFAULT FALSE,
  parto_anterior_otro             VARCHAR(80),

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

  posicion_parto                  VARCHAR(50),
  lugar_atencion_parto            VARCHAR(50),
  horas_distancia                 INTEGER,
  kms_servicio                    DECIMAL(6,2),
  casa_materna_cercana            BOOLEAN DEFAULT FALSE,
  usara_casa_materna              BOOLEAN DEFAULT FALSE,

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

  cuenta_ahorro                   BOOLEAN DEFAULT FALSE,
  comunicado_comite               BOOLEAN DEFAULT FALSE,

  con_quien_hijos                 VARCHAR(80),
  quien_cuida_casa                VARCHAR(80),
  telefono_vehiculo               VARCHAR(20),

  responsable_activar             VARCHAR(80),
  nombre_activara_plan            VARCHAR(150),
  nombre_proveedor_salud          VARCHAR(150),

  registrado_por                  INTEGER REFERENCES usuarios(id),
  created_at                      TIMESTAMPTZ DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MÓDULO 7 — FICHA DE RIESGO OBSTÉTRICO
-- 25 criterios con clasificación automática STORED
-- Sin cambios estructurales respecto a v1.0
-- ============================================================

CREATE TABLE IF NOT EXISTS referencias_efectuadas (
  id                SERIAL PRIMARY KEY,
  paciente_id       INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  fecha             DATE NOT NULL,
  lugar_referencia  VARCHAR(200) NOT NULL,
  diagnostico       TEXT,
  registrado_por    INTEGER REFERENCES usuarios(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fichas_riesgo_obstetrico (
  id                                SERIAL PRIMARY KEY,
  paciente_id                       INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  embarazo_id                       INTEGER REFERENCES embarazos(id) ON DELETE CASCADE,
  fecha                             DATE NOT NULL,

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

  -- Criterios 1-7: Antecedentes obstétricos
  muerte_fetal_neonatal_previa      BOOLEAN DEFAULT FALSE,
  abortos_espontaneos_3mas          BOOLEAN DEFAULT FALSE,
  gestas_3mas                       BOOLEAN DEFAULT FALSE,
  peso_ultimo_bebe_menor_2500g      BOOLEAN DEFAULT FALSE,
  peso_ultimo_bebe_mayor_4500g      BOOLEAN DEFAULT FALSE,
  antec_hipertension_preeclampsia   BOOLEAN DEFAULT FALSE,
  cirugias_tracto_reproductivo      BOOLEAN DEFAULT FALSE,

  -- Criterios 8-19: Embarazo actual
  embarazo_multiple                 BOOLEAN DEFAULT FALSE,
  menor_20_anos                     BOOLEAN DEFAULT FALSE,
  mayor_35_anos                     BOOLEAN DEFAULT FALSE,
  paciente_rh_negativo              BOOLEAN DEFAULT FALSE,
  hemorragia_vaginal                BOOLEAN DEFAULT FALSE,
  vih_positivo_sifilis              BOOLEAN DEFAULT FALSE,
  presion_diastolica_90mas          BOOLEAN DEFAULT FALSE,
  anemia                            BOOLEAN DEFAULT FALSE,
  desnutricion_obesidad             BOOLEAN DEFAULT FALSE,
  dolor_abdominal                   BOOLEAN DEFAULT FALSE,
  sintomatologia_urinaria           BOOLEAN DEFAULT FALSE,
  ictericia                         BOOLEAN DEFAULT FALSE,

  -- Criterios 20-25: Historia clínica general
  diabetes                          BOOLEAN DEFAULT FALSE,
  enfermedad_renal                  BOOLEAN DEFAULT FALSE,
  enfermedad_corazon                BOOLEAN DEFAULT FALSE,
  hipertension_arterial             BOOLEAN DEFAULT FALSE,
  consumo_drogas_alcohol_tabaco     BOOLEAN DEFAULT FALSE,
  otra_enfermedad_severa            BOOLEAN DEFAULT FALSE,
  otra_enfermedad_descripcion       TEXT,

  -- Clasificación automática
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

  registrado_por                    INTEGER REFERENCES usuarios(id),
  created_at                        TIMESTAMPTZ DEFAULT NOW(),
  updated_at                        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES PARA PERFORMANCE
-- ============================================================

ALTER TABLE vacunas_paciente ADD COLUMN IF NOT EXISTS embarazo_id INTEGER REFERENCES embarazos(id) ON DELETE CASCADE;
ALTER TABLE controles_prenatales ADD COLUMN IF NOT EXISTS embarazo_id INTEGER REFERENCES embarazos(id) ON DELETE CASCADE;
ALTER TABLE morbilidad_embarazo ADD COLUMN IF NOT EXISTS embarazo_id INTEGER REFERENCES embarazos(id) ON DELETE CASCADE;
ALTER TABLE controles_puerperio ADD COLUMN IF NOT EXISTS embarazo_id INTEGER REFERENCES embarazos(id) ON DELETE CASCADE;
ALTER TABLE planes_parto ADD COLUMN IF NOT EXISTS embarazo_id INTEGER REFERENCES embarazos(id) ON DELETE CASCADE;
ALTER TABLE fichas_riesgo_obstetrico ADD COLUMN IF NOT EXISTS embarazo_id INTEGER REFERENCES embarazos(id) ON DELETE CASCADE;

INSERT INTO embarazos (paciente_id, numero_embarazo, estado, fur, fpp, fecha_inicio, registrado_por)
SELECT p.id, 1, 'activo', p.fur, p.fpp, COALESCE(p.fur, p.created_at::date, CURRENT_DATE), p.registrado_por
FROM pacientes p
WHERE NOT EXISTS (
  SELECT 1 FROM embarazos e WHERE e.paciente_id = p.id
);

UPDATE vacunas_paciente v
SET embarazo_id = e.id
FROM embarazos e
WHERE v.embarazo_id IS NULL AND v.paciente_id = e.paciente_id AND e.estado = 'activo';

UPDATE controles_prenatales c
SET embarazo_id = e.id
FROM embarazos e
WHERE c.embarazo_id IS NULL AND c.paciente_id = e.paciente_id AND e.estado = 'activo';

UPDATE morbilidad_embarazo m
SET embarazo_id = e.id
FROM embarazos e
WHERE m.embarazo_id IS NULL AND m.paciente_id = e.paciente_id AND e.estado = 'activo';

UPDATE controles_puerperio cp
SET embarazo_id = e.id
FROM embarazos e
WHERE cp.embarazo_id IS NULL AND cp.paciente_id = e.paciente_id AND e.estado = 'activo';

UPDATE planes_parto pp
SET embarazo_id = e.id
FROM embarazos e
WHERE pp.embarazo_id IS NULL AND pp.paciente_id = e.paciente_id AND e.estado = 'activo';

UPDATE fichas_riesgo_obstetrico r
SET embarazo_id = e.id
FROM embarazos e
WHERE r.embarazo_id IS NULL AND r.paciente_id = e.paciente_id AND e.estado = 'activo';

CREATE INDEX IF NOT EXISTS idx_pacientes_expediente   ON pacientes(no_expediente);
CREATE INDEX IF NOT EXISTS idx_pacientes_cui          ON pacientes(cui);
CREATE INDEX IF NOT EXISTS idx_pacientes_apellidos    ON pacientes(apellidos);
CREATE INDEX IF NOT EXISTS idx_pacientes_nombres      ON pacientes(nombres);
CREATE INDEX IF NOT EXISTS idx_controles_paciente     ON controles_prenatales(paciente_id);
CREATE INDEX IF NOT EXISTS idx_controles_fecha        ON controles_prenatales(fecha);
CREATE INDEX IF NOT EXISTS idx_morbilidad_paciente    ON morbilidad_embarazo(paciente_id);
CREATE INDEX IF NOT EXISTS idx_puerperio_paciente     ON controles_puerperio(paciente_id);
DROP INDEX IF EXISTS ux_riesgo_paciente_unico;
DROP INDEX IF EXISTS ux_vacunas_paciente_dosis;
ALTER TABLE controles_prenatales DROP CONSTRAINT IF EXISTS controles_prenatales_paciente_id_numero_control_key;
ALTER TABLE controles_puerperio DROP CONSTRAINT IF EXISTS controles_puerperio_paciente_id_numero_atencion_key;

CREATE UNIQUE INDEX IF NOT EXISTS ux_riesgo_embarazo_unico ON fichas_riesgo_obstetrico(embarazo_id);
CREATE INDEX IF NOT EXISTS idx_riesgo_paciente        ON fichas_riesgo_obstetrico(paciente_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_vacunas_embarazo_dosis ON vacunas_paciente(embarazo_id, tipo_vacuna, momento, numero_dosis);
CREATE UNIQUE INDEX IF NOT EXISTS ux_controles_embarazo_numero ON controles_prenatales(embarazo_id, numero_control);
CREATE UNIQUE INDEX IF NOT EXISTS ux_puerperio_embarazo_numero ON controles_puerperio(embarazo_id, numero_atencion);
CREATE INDEX IF NOT EXISTS idx_embarazos_paciente      ON embarazos(paciente_id);
CREATE INDEX IF NOT EXISTS idx_controles_embarazo      ON controles_prenatales(embarazo_id);
CREATE INDEX IF NOT EXISTS idx_riesgo_embarazo         ON fichas_riesgo_obstetrico(embarazo_id);
CREATE INDEX IF NOT EXISTS idx_vacunas_paciente       ON vacunas_paciente(paciente_id);
CREATE INDEX IF NOT EXISTS idx_referencias_paciente   ON referencias_efectuadas(paciente_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_username      ON usuarios(username);

-- ============================================================
-- AJUSTES INCREMENTALES PACIENTES
-- ============================================================

ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS vive_sola BOOLEAN DEFAULT FALSE;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS antec_diabetes_tipo VARCHAR(1);
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fam_otra_condicion_medica_grave BOOLEAN DEFAULT FALSE;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS nacidos_muertos INTEGER DEFAULT 0;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS rn_nc BOOLEAN DEFAULT FALSE;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS rn_normal BOOLEAN DEFAULT FALSE;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS antec_emb_ectopico_num INTEGER DEFAULT 0;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS antec_gemelares BOOLEAN DEFAULT FALSE;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS abortos_3_espont_consecutivos BOOLEAN DEFAULT FALSE;

UPDATE pacientes
SET antec_emb_ectopico_num = 1
WHERE antec_emb_ectopico = TRUE
  AND COALESCE(antec_emb_ectopico_num, 0) = 0;

ALTER TABLE vacunas_paciente ADD COLUMN IF NOT EXISTS embarazo_id INTEGER REFERENCES embarazos(id) ON DELETE CASCADE;
ALTER TABLE controles_prenatales ADD COLUMN IF NOT EXISTS embarazo_id INTEGER REFERENCES embarazos(id) ON DELETE CASCADE;
ALTER TABLE morbilidad_embarazo ADD COLUMN IF NOT EXISTS embarazo_id INTEGER REFERENCES embarazos(id) ON DELETE CASCADE;
ALTER TABLE controles_puerperio ADD COLUMN IF NOT EXISTS embarazo_id INTEGER REFERENCES embarazos(id) ON DELETE CASCADE;
ALTER TABLE planes_parto ADD COLUMN IF NOT EXISTS embarazo_id INTEGER REFERENCES embarazos(id) ON DELETE CASCADE;
ALTER TABLE fichas_riesgo_obstetrico ADD COLUMN IF NOT EXISTS embarazo_id INTEGER REFERENCES embarazos(id) ON DELETE CASCADE;

INSERT INTO embarazos (paciente_id, numero_embarazo, estado, fur, fpp, fecha_inicio, registrado_por)
SELECT p.id, 1, 'activo', p.fur, p.fpp, COALESCE(p.fur, p.created_at::date, CURRENT_DATE), p.registrado_por
FROM pacientes p
WHERE NOT EXISTS (
  SELECT 1 FROM embarazos e WHERE e.paciente_id = p.id
);

UPDATE vacunas_paciente v
SET embarazo_id = e.id
FROM embarazos e
WHERE v.embarazo_id IS NULL AND v.paciente_id = e.paciente_id AND e.estado = 'activo';

UPDATE controles_prenatales c
SET embarazo_id = e.id
FROM embarazos e
WHERE c.embarazo_id IS NULL AND c.paciente_id = e.paciente_id AND e.estado = 'activo';

UPDATE morbilidad_embarazo m
SET embarazo_id = e.id
FROM embarazos e
WHERE m.embarazo_id IS NULL AND m.paciente_id = e.paciente_id AND e.estado = 'activo';

UPDATE controles_puerperio cp
SET embarazo_id = e.id
FROM embarazos e
WHERE cp.embarazo_id IS NULL AND cp.paciente_id = e.paciente_id AND e.estado = 'activo';

UPDATE planes_parto pp
SET embarazo_id = e.id
FROM embarazos e
WHERE pp.embarazo_id IS NULL AND pp.paciente_id = e.paciente_id AND e.estado = 'activo';

UPDATE fichas_riesgo_obstetrico r
SET embarazo_id = e.id
FROM embarazos e
WHERE r.embarazo_id IS NULL AND r.paciente_id = e.paciente_id AND e.estado = 'activo';

ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fuma_activamente_1er_trimestre BOOLEAN DEFAULT FALSE;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fuma_activamente_2do_trimestre BOOLEAN DEFAULT FALSE;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fuma_activamente_3er_trimestre BOOLEAN DEFAULT FALSE;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fuma_pasivamente_1er_trimestre BOOLEAN DEFAULT FALSE;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fuma_pasivamente_2do_trimestre BOOLEAN DEFAULT FALSE;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fuma_pasivamente_3er_trimestre BOOLEAN DEFAULT FALSE;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS consume_alcohol_1er_trimestre BOOLEAN DEFAULT FALSE;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS consume_alcohol_2do_trimestre BOOLEAN DEFAULT FALSE;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS consume_alcohol_3er_trimestre BOOLEAN DEFAULT FALSE;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS consume_drogas_1er_trimestre BOOLEAN DEFAULT FALSE;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS consume_drogas_2do_trimestre BOOLEAN DEFAULT FALSE;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS consume_drogas_3er_trimestre BOOLEAN DEFAULT FALSE;

ALTER TABLE pacientes DROP CONSTRAINT IF EXISTS pacientes_categoria_servicio_check;
ALTER TABLE pacientes ADD CONSTRAINT pacientes_categoria_servicio_check
  CHECK (categoria_servicio IN ('CCS','PS','CS_B','CS_A','CAP')) NOT VALID;

ALTER TABLE pacientes DROP CONSTRAINT IF EXISTS pacientes_clasificacion_alfa_beta_check;
ALTER TABLE pacientes ADD CONSTRAINT pacientes_clasificacion_alfa_beta_check
  CHECK (clasificacion_alfa_beta IN ('SI','NO','ALFA','BETA')) NOT VALID;

ALTER TABLE pacientes DROP CONSTRAINT IF EXISTS pacientes_nivel_estudios_check;
ALTER TABLE pacientes ADD CONSTRAINT pacientes_nivel_estudios_check
  CHECK (nivel_estudios IN ('ninguno','primaria','basico','diversificado','universitaria','secundaria')) NOT VALID;

ALTER TABLE pacientes DROP CONSTRAINT IF EXISTS pacientes_estado_civil_check;
ALTER TABLE pacientes ADD CONSTRAINT pacientes_estado_civil_check
  CHECK (estado_civil IN ('casada','unida','soltera','separada','vive_sola')) NOT VALID;

ALTER TABLE pacientes DROP CONSTRAINT IF EXISTS pacientes_antec_diabetes_tipo_check;
ALTER TABLE pacientes ADD CONSTRAINT pacientes_antec_diabetes_tipo_check
  CHECK (antec_diabetes_tipo IN ('1','2','G')) NOT VALID;
