const fs = require('node:fs');
const path = require('node:path');
const { CRITERIA_KEYS, renderRiskPdf } = require('../src/services/riskPdfRenderer');

const output = path.resolve(process.argv[2] || path.join(__dirname, '../../output/pdf/cap-63-risk-sample.pdf'));
const sample = {
  paciente: {
    cui: '1234567890101', nombres: 'Maria Alejandra de los Angeles', apellidos: 'Hernandez Castellanos',
    fecha_nacimiento: '1991-03-14', municipio: 'Aldea de residencia extensa, El Chal, Peten',
    telefono: '5555 1234', pueblo: 'maya', estado_civil: 'casada', nivel_estudios: 'universitaria',
    profesion_oficio: 'Comerciante y agricultora independiente', nombre_esposo_conviviente: 'Jose Francisco Perez Lopez',
  },
  embarazo: { fur: '2026-01-15', fpp: '2026-10-22' },
  riesgo: {
    migrante: true, edad_esposo: 38, pueblo_esposo: 'mestizo', escolaridad_esposo: 'diversificado',
    ocupacion_esposo: 'Transportista de carga pesada', distancia_servicio_km: '0.5', tiempo_horas: '0.25',
    no_embarazos: 4, no_partos: 2, no_cesareas: 1, no_abortos: 1, no_hijos_vivos: 2,
    no_hijos_muertos: 1, edad_embarazo_semanas: 34, tiene_riesgo: true,
    referida_a: 'Hospital Regional de San Benito, clinica de alto riesgo obstetrico',
    nombre_personal_atendio: 'Licda. Ana Gabriela Morales Hernandez',
    ...Object.fromEntries(CRITERIA_KEYS.map((key, index) => [key, index % 2 === 0])),
  },
};

(async () => {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, await renderRiskPdf(sample, { now: new Date(2026, 8, 10) }));
  process.stdout.write(`${output}\n`);
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
