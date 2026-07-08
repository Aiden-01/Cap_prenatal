const PAGE = {
  width: 612,
  height: 936,
};

const CONTROL_COLUMNS = [62, 169, 276, 383, 490];
const PAGE2_CONTROL_COLUMNS = [62, 169, 276, 383];

// Helper para pares No/Si. En esta ficha la primera casilla es "No" y la
// segunda, a la derecha, es "Si". Ajusta x/y sobre la casilla "No"; gap mueve
// la casilla "Si" horizontalmente.
const yn = (x, y, gap = 12) => ({ no: { x, y }, yes: { x: x + gap, y } });
const siNo = (x, y, gap = 12) => ({ yes: { x, y }, no: { x: x + gap, y } });
const when = (active, cfg) => (active ? cfg : null);

// ============================================================
// PAGINA 1: DATOS GENERALES, ANTECEDENTES Y PRIMERA MATRIZ
// ============================================================

// Guia rapida para la zona de ANTECEDENTES de la pagina 1:
// - Antecedentes familiares:
//   famTbc, famDiabetes, famHipertension, famPreeclampsia,
//   famEclampsia, famOtraCondicion
// - Antecedentes personales, columna izquierda:
//   antecTbc, antecDiabetes, antecHipertension, antecPreeclampsia,
//   antecEclampsia, antecOtraCondicion
// - Antecedentes personales, columna derecha:
//   cirugiaGenitoUrinaria, infertilidad, antecCardiopatia,
//   antecNefropatia, antecViolencia, antecVih
// - Subopciones de diabetes:
//   antecDiabetesTipo1, antecDiabetesTipo2, antecDiabetesTipoG
//
// En el PDF de depuracion las etiquetas aparecen como "campo:yes" o "campo:no".
// Busca el mismo nombre en page1.yesNo o page1.marks.booleans y mueve su x/y.

const page1 = {
  text: {
    noExpediente: { x: 449, y: 118, w: 130, size: 6.2 },
    establecimiento: { x: 40, y: 195, w: 285, size: 5.8 },
    distrito: { x: 310, y: 195, w: 150, size: 5.8 },
    areaSalud: { x: 40, y: 216, w: 285, size: 5.8 },
    nombres: { x: 40, y: 252, w: 280, size: 5.8 },
    apellidos: { x: 310, y: 252, w: 280, size: 5.8 },
    domicilio: { x: 40, y: 270, w: 280, size: 5.8 },
    municipio: { x: 310, y: 270, w: 280, size: 5.8 },
    territorio: { x: 40, y: 287, w: 70, size: 5.8 },
    sector: { x: 310, y: 287, w: 70, size: 5.8 },
    comunidad: { x: 40, y: 306, w: 280, size: 5.8 },
    telefono: { x: 310, y: 306, w: 180, size: 5.8 },
    edad: { x: 23, y: 363, w: 34, size: 5.8, align: 'center' },
    ultimoAnioAprobado: { x: 119, y: 360, w: 34, size: 5.6, align: 'center' },
    profesion: { x: 148, y: 330, w: 66, h: 14, size: 5.1, maxLines: 2 },
    esposo: { x: 264, y: 341, w: 70, h: 14, size: 5, maxLines: 2 },
    migranteDetalle: { x: 366, y: 333, w: 100, h: 14, size: 5, maxLines: 2 },
    comunidadLinguistica: { x: 510, y: 330, w: 78, h: 14, size: 5, maxLines: 2 },
    coberturaPrivadaDetalle: { x: 149, y: 385, w: 185, size: 5.2 },
    referidaDe: { x: 395, y: 385, w: 190, size: 5.2 },
    gestasPrevias: { x: 270, y: 424, w: 22, size: 7, align: 'center' },
    abortos: { x: 318, y: 424, w: 20, size: 7, align: 'center' },
    partosVaginales: { x: 353, y: 424, w: 20, size: 7, align: 'center' },
    nacidosVivos: { x: 400, y: 424, w: 20, size: 7, align: 'center' },
    hijosViven: { x: 456, y: 424, w: 20, size: 7, align: 'center' },
    nacidosMuertos: { x: 394, y: 469, w: 22, size: 7, align: 'center' },
    muertosAntes1Semana: { x: 456, y: 443, w: 18, size: 7, align: 'center' },
    muertosDespues1Semana: { x: 456, y: 469, w: 18, size: 7, align: 'center' },
    partos: { x: 318, y: 470, w: 20, size: 7, align: 'center' },
    cesareas: { x: 350, y: 469, w: 20, size: 7, align: 'center' },
    embarazoEctopicoNum: { x: 272, y: 442, w: 20, size: 7, align: 'center' },
  },
  dateTiny: {
    fechaNacimiento: { x: 15, y: 339 },
  },
  date: {
    finEmbarazoAnterior: { x: 482, y: 429 },
    fur: { x: 335, y: 507 },
    fpp: { x: 335, y: 527 },
  },
  digitBoxes: {
    cui: {
      x: 462,
      y: 139,
      gap: 10.25,
      size: 5.5,
      max: 13,
    },
  },
  marks: {
    categoria: {
      CCS: { x: 372, y: 213 },
      PS: { x: 413, y: 213 },
      CS_B: { x: 464, y: 213 },
      CS_A: { x: 512, y: 213 },
      CAP: { x: 512, y: 213 },
    },
    rangoEdad: {
      '14_19': { x: 60, y: 350 },
      menor_14: { x: 60, y: 360 },
      mayor_35: { x: 60, y: 360 },
    },
    clasificacion: {
      SI: { x: 93, y: 358 },
      ALFA: { x: 93, y: 358 },
      NO: { x: 93, y: 340 },
      BETA: { x: 93, y: 340 },
    },
    nivelEstudios: {
      ninguno: { x: 112, y: 325 },
      primaria: { x: 132, y: 325 },
      basico: { x: 112, y: 340 },
      secundaria: { x: 112, y: 340 },
      diversificado: { x: 132, y: 340 },
      universitaria: { x: 132, y: 340 },
    },
    estadoCivil: {
      casada: { x: 251, y: 316 },
      unida: { x: 251, y: 326 },
      soltera: { x: 251, y: 336 },
      separada: { x: 251, y: 346 },
    },
    pueblo: {
      maya: { x: 478, y: 325 },
      garifuna: { x: 478, y: 335 },
      xinca: { x: 478, y: 345 },
      mestizo: { x: 478, y: 355 },
      otro: { x: 486, y: 364 },
    },
    fracasoMetodo: {
      no: { x: 485, y: 464 },
      barrera: { x: 503, y: 464 },
      diu: { x: 520, y: 464 },
      hormonal: { x: 539, y: 464 },
      natural: { x: 574, y: 464 },
      emergencia: { x: 557, y: 464 },
    },
    booleans: {
      // Subopciones bajo "diabetes" en antecedentes personales.
      antecDiabetesTipo1: { x: 117, y: 432 },
      antecDiabetesTipo2: { x: 127, y: 432 },
      antecDiabetesTipoG: { x: 138, y: 432 },
      rnNc: { x: 221, y: 441 },
      rnNormal: { x: 221, y: 451 },
      rnMenor2500: { x: 254, y: 441 },
      rnMayor4000: { x: 254, y: 451 },
      abortosConsecutivos: { x: 330, y: 440 },
      finEmbarazoMenos1Anio: { x: 572, y: 417 },
      // Vacunas: no | previo embarazo | durante embarazo | postparto/aborto.
      vacunaTdTdapNo: { x: 78, y: 564 },
      vacunaTdTdapPrevio: { x: 114, y: 564 },
      vacunaTdTdapDurante: { x: 147, y: 564 },
      vacunaTdTdapPostparto: { x: 181, y: 564 },
      vacunaInfluenzaNo: { x: 78, y: 579 },
      vacunaInfluenzaPrevio: { x: 114, y: 579 },
      vacunaInfluenzaDurante: { x: 147, y: 579 },
      vacunaInfluenzaPostparto: { x: 181, y: 579 },
      vacunaSprSrNo: { x: 78, y: 595 },
      vacunaSprSrPrevio: { x: 114, y: 595 },
      vacunaSprSrDurante: { x: 147, y: 595 },
      vacunaSprSrPostparto: { x: 181, y: 595 },
    },
  },
  yesNo: {
    migrante: { yes: { x: 346, y: 340 }, no: { x: 346, y: 358 } },
    coberturaIgss: { yes: { x: 39, y: 392 }, no: { x: 52, y: 392 } },
    coberturaPrivada: { yes: { x: 99, y: 392 }, no: { x: 112, y: 392 } },
    vieneReferida: { yes: { x: 353, y: 392 }, no: { x: 366, y: 392 } },
    viveSola: { yes: { x: 251, y: 364 }, no: { x: 236, y: 364 } },
    embarazoPlaneado: { yes: { x: 578, y: 443 }, no: { x: 560, y: 443 } },
    embarazoAbusoSexual: { yes: { x: 259, y: 517 }, no: { x: 272, y: 517 } },

    // Antecedentes familiares, de arriba hacia abajo en la ficha.
    famTbc: yn(38, 422),
    famDiabetes: yn(38, 432),
    famHipertension: yn(38, 442),
    famPreeclampsia: yn(38, 452),
    famEclampsia: yn(38, 463),
    famOtraCondicion: yn(38, 473),

    // Antecedentes personales, columna izquierda, de arriba hacia abajo.
    antecTbc: yn(105, 422),
    antecDiabetes: yn(105, 432),
    antecHipertension: yn(105, 442),
    antecPreeclampsia: yn(105, 452),
    antecEclampsia: yn(105, 463),
    antecOtraCondicion: yn(105, 473),

    // Antecedentes personales, columna derecha, de arriba hacia abajo.
    cirugiaGenitoUrinaria: yn(174, 414),
    infertilidad: yn(174, 424),
    antecCardiopatia: yn(174, 434),
    antecNefropatia: yn(174, 444),
    antecViolencia: yn(174, 454),
    antecVih: yn(174, 464),
    //este esta dentro de obstetricos
    antecGemelares: { yes: { x: 254, y: 470 }, no: { x: 242, y: 470 } },
    egConfiableFur: { yes: { x: 470, y: 502 }, no: { x: 481, y: 502 } },
    egConfiableUsg: { yes: { x: 470, y: 529 }, no: { x: 481, y: 529 } },
    tieneFichaRiesgo: { yes: { x: 550, y: 519 }, no: { x: 563, y: 519 } },

    // Habitos y violencia por trimestre.
    fumaActivaT1: yn(73, 503),
    fumaActivaT2: yn(73, 516),
    fumaActivaT3: yn(73, 529),
    fumaPasivaT1: yn(107, 503),
    fumaPasivaT2: yn(107, 516),
    fumaPasivaT3: yn(107, 529),
    drogasT1: yn(141, 503),
    drogasT2: yn(141, 516),
    drogasT3: yn(141, 529),
    alcoholT1: yn(176, 503),
    alcoholT2: yn(176, 516),
    alcoholT3: yn(176, 529),
    violenciaT1: yn(209, 503),
    violenciaT2: yn(209, 516),
    violenciaT3: yn(209, 529),
  },
  //apartado de las fechas de las vacunas
  vaccineDates: {
    previoDosis: { x: 259, y: 549, w: 42, size: 6.4, align: 'center' },
    previoFecha1: { x: 249, y: 569 },
    previoFecha2: { x: 249, y: 594 },
    duranteFecha1: { x: 350, y: 579 },
    duranteFecha2: { x: 433, y: 579 },
    duranteFecha3: { x: 518, y: 579 },
  },
  controls: CONTROL_COLUMNS.map((x) => ({
    fecha: { x: x + 20, y: 635, yearOffset: 41 },
    hora: { hour: { x: x + 36, y: 662 }, minute: { x: x + 60, y: 662 } },
    motivo: { x: x + 4, y: 680, w: 96, h: 40, size: 6.2, maxLines: 5, lineGap: 7 },
    signosPeligro: {
      hemorragiaVaginal: { x: x + 52, y: 753 },
      palidez: { x: x + 52, y: 767 },
      dolorCabeza: { x: x + 52, y: 781 },
      hipertension: { x: x + 52, y: 796 },
      dolorEpigastrico: { x: x + 52, y: 810 },
      trastornosVisuales: { x: x + 52, y: 824 },
      fiebre: { x: x + 52, y: 838 },
      otro: { x: x + 5, y: 852, w: 96, size: 4.2 },
    },
    edadGestacional: { x: x + 5, y: 876, w: 90, size: 6.5 },
    acompanante: { x: x + 5, y: 890, w: 90, size: 6.2 },
    atiende: { x: x + 5, y: 904, w: 90, size: 5.8 },
  })),
};

// =============================================================================================================================
// PAGINA 2: CONTROLES, LABORATORIOS Y ORIENTACIONES
// =================================================================================================================

const page2Control = (x, idx) => ({
  examenFisico: {
    pa: { x: x + 5, y: 109, w: 96, size: 5.8 },
    fc: { x: x + 5, y: 125, w: 96, size: 5.8 },
    fr: { x: x + 5, y: 140, w: 96, size: 5.8 },
    temperatura: { x: x + 5, y: 155, w: 96, size: 5.8 },
    perimetroBraquial: when(idx === 0 || idx === 4, { x: x + 5, y: 171, w: 96, size: 5.8 }),
    peso: when(idx !== 0, { x: x + 5, y: 186, w: 96, size: 5.8 }),
    talla: when(idx !== 0, { x: x + 5, y: 201, w: 96, size: 5.8 }),
    imc: when(idx !== 0, { x: x + 5, y: 216, w: 96, size: 5.8 }),
    bucodental: when(idx === 0 || idx === 2 || idx === 4, siNo(x + 40, 232)),
    mamas: siNo(x + (idx === 1 ? 44 : idx === 3 ? 42 : 40), 247),
  },
  examenObstetrico: {
    alturaUterina: when(idx !== 0, { x: x + 5, y: 281, w: 96, size: 5.8 }),
    fcf: when(idx !== 0, { x: x + 5, y: 296, w: 96, size: 5.8 }),
    movimientosFetales: when(idx !== 0, siNo(x + 44, 311)),
    situacionFetal: when(idx >= 2, { x: x + 5, y: 328, w: 96, size: 5.6 }),
    presentacionFetal: when(idx >= 2, { x: x + 5, y: 343, w: 96, size: 5.6 }),
  },
  examenGinecologico: {
    sangreManchado: siNo(x + (idx >= 1 && idx <= 3 ? 43 : 45), 374),
    verrugasHerpesPapilomas: siNo(x + (idx >= 1 && idx <= 3 ? 44 : 46), 394),
    flujoVaginal: siNo(x + (idx >= 1 && idx <= 3 ? 44 : 46), 411),
    otros: { x: x + 5, y: 419, w: 96, size: 5.2 },
  },
  laboratorios: {
    hematologia: when(idx === 0 || idx === 2 || idx === 4, { done: siNo(x + 7, 455), result: { x: x + 34, y: 455, w: 68, size: 4.8 } }),
    glicemia: { done: siNo(x + 7, 470), result: { x: x + 34, y: 470, w: 68, size: 4.8 } },
    grupoRh: when(idx === 0 || idx === 4, { positive: { x: x + 7, y: 487 }, negative: { x: x + 22, y: 487 }, result: { x: x + 34, y: 487, w: 68, size: 4.8 } }),
    orina: {
      done: siNo(x + 45, 501),
      bacteriuria: siNo(x + 45, 516),
      proteinuria: siNo(x + 45, 532),
    },
    heces: when(idx === 0 || idx === 4, { done: siNo(x + 7, 548), result: { x: x + 34, y: 548, w: 68, size: 4.8 } }),
    vih: {
      positive: { x: x + (idx >= 1 && idx <= 3 ? 5 : 7), y: 563 },
      negative: { x: x + (idx >= 1 && idx <= 3 ? 17 : 19), y: 563 },
      result: { x: x + 34, y: 563, w: 28, size: 4.5 },
    },
    vdrl: {
      positive: { x: x + (idx >= 1 && idx <= 3 ? 5 : 7), y: 579 },
      negative: { x: x + (idx >= 1 && idx <= 3 ? 18 : 18), y: 579 },
      result: { x: x + 34, y: 579, w: 28, size: 4.5 },
    },
    torch: {
      positive: { x: x + (idx === 1 ? 6 : idx === 2 ? 5 : idx === 3 ? 4.5 : 7), y: 610 },
      negative: { x: x + (idx === 1 ? 18 : idx === 2 ? 17 : idx === 3 ? 16.5 : 19), y: 610 },
      result: { x: x + 34, y: 610, w: 68, size: 4.5 },
    },
    papanicolauIvaa: {
      positive: { x: x + (idx === 1 ? 6 : idx === 2 ? 5 : idx === 3 ? 4.5 : 7), y: 626 },
      negative: { x: x + (idx === 1 ? 18 : idx === 2 ? 17 : idx === 3 ? 16.5 : 19), y: 626 },
      result: { x: x + 34, y: 626, w: 68, size: 4.5 },
    },
    hepatitisB: {
      positive: { x: x + (idx === 1 ? 6 : idx === 2 ? 5 : idx === 3 ? 4.5 : 7), y: 641 },
      negative: { x: x + (idx === 1 ? 18 : idx === 2 ? 17 : idx === 3 ? 16.5 : 19), y: 641 },
      result: { x: x + 34, y: 641, w: 68, size: 4.5 },
    },
    otros: { x: x + 5, y: 652, w: 96, size: 4.0 },
  },
  estudiosComplementarios: {
    usg: siNo(x + (idx === 1 ? 6 : idx === 2 ? 5 : idx === 3 ? 4.5 : 7), 690),
    hallazgosUsg: { x: x + 5, y: 704, w: 96, h: 24, size: 4.8, maxLines: 2 },
  },
  orientaciones: {
    planEmergenciaParto: siNo(x + (idx === 1 ? 7 : idx === 2 ? 6.5 : idx === 3 ? 6 : 7), 756),
    alimentacionEmbarazo: siNo(x + (idx === 1 ? 7 : idx === 2 ? 6.5 : idx === 3 ? 6 : 7), 771),
    senalesPeligro: siNo(x + (idx === 1 ? 7 : idx === 2 ? 6.5 : idx === 3 ? 6 : 7), 786),
    importanciaAtenciones: siNo(x + (idx === 1 ? 7 : idx === 2 ? 6.5 : idx === 3 ? 6 : 7), 801),
    prePostPruebaVih: when(idx !== 2, siNo(x + (idx === 1 ? 7 : idx === 2 ? 6.5 : idx === 3 ? 6 : 7), 818)),
    tratamientoItsPareja: siNo(x + (idx === 1 ? 7 : idx === 2 ? 6.5 : idx === 3 ? 6 : 7), 833),
    lactanciaMaterna: siNo(x + (idx === 1 ? 7 : idx === 2 ? 6.5 : idx === 3 ? 6 : 7), 848),
    planificacionFamiliar: when(idx === 3 || idx === 4, siNo(x + (idx === 1 ? 7 : idx === 2 ? 6.5 : idx === 3 ? 6 : 7), 863)),
    importanciaPostparto: when(idx === 3 || idx === 4, siNo(x + (idx === 1 ? 7 : idx === 2 ? 6.5 : idx === 3 ? 6 : 7), 878)),
    vacunacionNino: when(idx === 3 || idx === 4, siNo(x + (idx === 1 ? 7 : idx === 2 ? 6.5 : idx === 3 ? 6 : 7), 893)),
    otros: { x: x + 5, y: 908, w: 96, size: 4.0 },
  },
});

const page2 = {
  controls: PAGE2_CONTROL_COLUMNS.map((x, idx) => page2Control(x, idx)),
};

// ==================================================================================================================
// PAGINA 4: PUERPERIO
// =================================================================================================================

const puerperioBlock = (offsetY = 0, includeApego = true) => ({
  fecha: { x: 52, y: 111 + offsetY, yearOffset: 42 },
  hora: { hour: { x: 162, y: 111 + offsetY }, minute: { x: 186, y: 111 + offsetY } },
  signosPeligro: { x: 142, y: 136 + offsetY, w: 410, size: 5.6, maxLines: 1 },
  diasDespuesParto: { x: 143, y: 157 + offsetY, w: 155, size: 5.8 },
  lugarParto: { x: 143, y: 176 + offsetY, w: 155, size: 5.8 },
  quienAtendioParto: { x: 143, y: 194 + offsetY, w: 155, size: 5.8 },
  recienNacidoVivo: siNo(104, 210 + offsetY),
  apegoInmediato: includeApego ? siNo(226, 210 + offsetY) : null,
  lactanciaMaternaExclusiva: siNo(405, 210 + offsetY),
  pa: { x: 345, y: 157 + offsetY, w: 68, size: 7.8 },
  fc: { x: 345, y: 174 + offsetY, w: 68, size: 7.8 },
  fr: { x: 486, y: 174 + offsetY, w: 58, size: 7.8 },
  tipoParto: { x: 366, y: 194 + offsetY, w: 48, size: 5.8 },
  temperatura: {
    boxes: [
      { x: 512, y: 194 + offsetY, w: 10, size: 5.8, align: 'center' },
      { x: 524, y: 194 + offsetY, w: 10, size: 5.8, align: 'center' },
      { x: 533, y: 194 + offsetY, w: 18, size: 5.8, align: 'center' },
    ],
  },
  heridaOperatoria: { x: 507, y: 209 + offsetY, w: 60, size: 5.4 },
  examenMamas: {
    x: 114,
    y: 228 + offsetY,
    w: 430,
    firstLineX: 114,
    firstLineWidth: 430,
    nextLinesX: 52,
    nextLinesWidth: 500,
    size: 5.6,
    maxLines: 2,
    lineGap: 5,
  },
  examenGinecologico: {
    x: 315,
    y: 268 + offsetY,
    w: 245,
    firstLineX: 315,
    firstLineWidth: 245,
    nextLinesX: 52,
    nextLinesWidth: 500,
    size: 5.4,
    maxLines: 3,
    lineGap: 5,
  },
  orientacionConsejeria: {
    x: 92,
    y: 339 + offsetY,
    w: 455,
    firstLineX: 92,
    firstLineWidth: 455,
    nextLinesX: 52,
    nextLinesWidth: 500,
    size: 5.6,
    maxLines: 3,
    lineGap: 8,
  },
  impresionClinica: {
    x: 75,
    y: 392 + offsetY,
    w: 470,
    firstLineX: 75,
    firstLineWidth: 470,
    nextLinesX: 52,
    nextLinesWidth: 500,
    size: 5.6,
    maxLines: 3,
    lineGap: 8,
  },
  tratamiento: {
    x: 61,
    y: 447 + offsetY,
    w: 485,
    firstLineX: 61,
    firstLineWidth: 485,
    nextLinesX: 52,
    nextLinesWidth: 500,
    size: 5.6,
    maxLines: 3,
    lineGap: 8,
  },
  nombreCargoAtiende: { x: 155, y: 499 + offsetY, w: 390, size: 7.6 },
});

const page4 = {
  puerperio: [
    puerperioBlock(0, true),
    puerperioBlock(411, false),
  ],
};

module.exports = {
  PAGE,
  pages: {
    1: page1,
    2: page2,
    3: {},
    4: page4,
  },
};
