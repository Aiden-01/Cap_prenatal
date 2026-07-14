const fs = require('fs');
const path = require('path');
const { generarFichaClinicaPrenatalPdf } = require('../src/services/fichaClinicaPrenatalPdf');

const outputDir = path.join(__dirname, '../../tmp/pdfs');
const base = {
  paciente: {
    no_expediente: 'VISUAL-P3',
    nombres: 'Paciente',
    apellidos: 'Prueba Visual',
  },
  embarazo: { id: 20 },
};

const evento = (id, fecha, texto = '') => ({
  id,
  embarazo_id: 20,
  fecha,
  hora: '08:15:00',
  motivo_consulta: `Consulta ${id} por dolor abdominal ${texto}`,
  historia_enfermedad_actual: `Dolor abdominal de dos dias de evolucion ${texto}`,
  revision_por_sistemas: `Sin fiebre, sin sintomas urinarios y sin dificultad respiratoria ${texto}`,
  examen_fisico: `Paciente alerta, hidratada y con signos vitales estables ${texto}`,
  impresion_clinica: `Dolor abdominal durante el embarazo, actualmente estable ${texto}`,
  tratamiento_referencia: `Hidratacion, vigilancia y reevaluacion en veinticuatro horas ${texto}`,
  nombre_cargo_atiende: `Profesional ${id} - Medica`,
});

const casos = {
  'page3-empty.pdf': {},
  'page3-supplementation.pdf': {
    controles: [{
      id: 1,
      numero_control: 1,
      sulfato_ferroso: true,
      sulfato_ferroso_tabletas: 30,
      acido_folico: true,
      acido_folico_tabletas: 60,
      suplementacion_hallazgos: 'Buena tolerancia',
      suplementacion_tratamiento: 'Continuar dosis diaria',
    }],
  },
  'page3-one-morbidity.pdf': {
    morbilidad: [evento(1, '2026-02-10')],
  },
  'page3-multiple-morbidities.pdf': {
    morbilidad: [
      evento(3, '2026-04-10'),
      evento(1, '2026-02-10'),
      evento(2, '2026-03-10'),
    ],
  },
  'page3-long-text.pdf': {
    morbilidad: [evento(
      1,
      '2026-02-10',
      Array.from({ length: 45 }, () => 'descripcion clinica extensa').join(' ')
    )],
  },
};

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  for (const [filename, data] of Object.entries(casos)) {
    const bytes = await generarFichaClinicaPrenatalPdf({ ...base, ...data });
    fs.writeFileSync(path.join(outputDir, filename), bytes);
    console.log(path.join(outputDir, filename));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
