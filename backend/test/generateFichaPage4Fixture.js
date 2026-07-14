const fs = require('fs');
const path = require('path');
const { generarFichaClinicaPrenatalPdf } = require('../src/services/fichaClinicaPrenatalPdf');

const output = path.join(__dirname, '../../tmp/pdfs/page4-long-puerperio.pdf');

function registro(numero) {
  return {
    numero_atencion: numero,
    fecha: numero === 1 ? '2026-08-01' : '2026-08-08',
    hora: numero === 1 ? '09:30:00' : '10:15:00',
    examen_mamas: 'Mamas simetricas, sin lesiones, sin dolor, pezones integros y lactancia materna exclusiva establecida adecuadamente.',
    examen_ginecologico: 'Utero en involucion adecuada para el tiempo posparto. Loquios normales, sin mal olor. No se observa sangrado abundante ni signos de infeccion al momento de la evaluacion.',
    orientacion_consejeria: 'Se brinda consejeria sobre lactancia materna exclusiva, higiene personal, signos de peligro en el puerperio y recien nacido, importancia de acudir a control, planificacion familiar y alimentacion adecuada.',
    impresion_clinica: 'Puerpera hemodinamicamente estable, sin signos de alarma al momento de la evaluacion. Recien nacido vivo, con lactancia materna exclusiva.',
    tratamiento: 'Continuar control puerperal segun norma. Acudir inmediatamente al servicio de salud si presenta fiebre, sangrado abundante, dolor intenso, secrecion con mal olor, cefalea intensa, vision borrosa o dificultad respiratoria.',
    nombre_cargo_atiende: numero === 1 ? 'Maria Garcia - Medica' : 'Ana Lopez - Enfermera profesional',
  };
}

async function main() {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const bytes = await generarFichaClinicaPrenatalPdf({
    paciente: { no_expediente: 'VISUAL-P4' },
    embarazo: { id: 20 },
    puerperio: [registro(1), registro(2)],
  });
  fs.writeFileSync(output, bytes);
  console.log(output);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
