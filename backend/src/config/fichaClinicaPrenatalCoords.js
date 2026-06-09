const PAGE = {
  width: 612,
  height: 936,
};

const CONTROL_COLUMNS = [62, 169, 276, 383, 490];

// Helper para pares No/Si. En esta ficha la primera casilla es "No" y la
// segunda, a la derecha, es "Si". Ajusta x/y sobre la casilla "No"; gap mueve
// la casilla "Si" horizontalmente.
const yn = (x, y, gap = 12) => ({ no: { x, y }, yes: { x: x + gap, y } });

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
      vacunaTdTdapNo: { x: 76, y: 558 },
      vacunaTdTdapPrevio: { x: 103, y: 558 },
      vacunaTdTdapDurante: { x: 137, y: 558 },
      vacunaTdTdapPostparto: { x: 171, y: 558 },
      vacunaInfluenzaNo: { x: 76, y: 573 },
      vacunaInfluenzaPrevio: { x: 103, y: 573 },
      vacunaInfluenzaDurante: { x: 137, y: 573 },
      vacunaInfluenzaPostparto: { x: 171, y: 573 },
      vacunaSprSrNo: { x: 76, y: 589 },
      vacunaSprSrPrevio: { x: 103, y: 589 },
      vacunaSprSrDurante: { x: 137, y: 589 },
      vacunaSprSrPostparto: { x: 171, y: 589 },
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
  vaccineDates: {
    previoDosis: { x: 278, y: 557, w: 42, size: 6.4, align: 'center' },
    previoFecha1: { x: 304, y: 578 },
    previoFecha2: { x: 304, y: 608 },
    duranteFecha1: { x: 393, y: 579 },
    duranteFecha2: { x: 485, y: 579 },
    duranteFecha3: { x: 576, y: 579 },
  },
  controls: CONTROL_COLUMNS.map((x) => ({
    fecha: { x: x + 3, y: 640 },
    hora: { hour: { x: x + 13, y: 667 }, minute: { x: x + 39, y: 667 } },
    motivo: { x: x + 4, y: 693, w: 96, h: 40, size: 6.2, maxLines: 5 },
    edadGestacional: { x: x + 5, y: 876, w: 90, size: 6.5 },
    acompanante: { x: x + 5, y: 890, w: 90, size: 6.2 },
    atiende: { x: x + 5, y: 904, w: 90, size: 5.8 },
  })),
};

module.exports = {
  PAGE,
  pages: {
    1: page1,
    2: {},
    3: {},
    4: {},
  },
};
