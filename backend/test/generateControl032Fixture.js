const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { generarFichaClinicaPrenatalPdf } = require('../src/services/fichaClinicaPrenatalPdf');

// Fixture exclusivamente sintético; no conecta a BD ni carga credenciales.
const fixture = {
  paciente: { nombres: 'Paciente sintética', apellidos: 'Prueba' },
  embarazo: {},
  controles: [
    { numero_control: 1, fecha: '2026-11-18', nombre_atiende: 'Ana Ejemplo',
      cargo_atiende_snapshot: { id: 3, nombre: 'Médico/a', codigo: null }, nombre_cargo_atiende: 'No mezclar' },
    { numero_control: 2, fecha: '2026-11-18', nombre_cargo_atiende: 'Texto legado íntegro' },
    { numero_control: 3, fecha: '2026-11-18', nombre_atiende: 'Nombre declarado',
      cargo_atiende_snapshot: { id: 4, nombre: 'Cargo', codigo: 'EP' },
      situacion_fetal: 'Longitudinal', presentacion_fetal: 'Pélvica/podálica' },
  ],
};

if (require.main === module) {
  const target = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'cap-prenatal-control-032.pdf'));
  generarFichaClinicaPrenatalPdf(fixture).then(bytes => {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    console.log(target);
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { fixture };
