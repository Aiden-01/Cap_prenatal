const base = (tipo, contenido, linked = false) => ({
  paciente: { id: 1, nombres: 'María Elena', apellidos: 'Ejemplo Sintético', no_expediente: 'SIM-CP13-001' },
  nota: { id: 1301, paciente_id: 1, embarazo_id: linked ? 11 : null,
    control_prenatal_id: linked ? 903 : null, tipo, estado: 'captura_finalizada', version: 1,
    fecha_atencion: '2026-10-20', hora_atencion: '09:30:00', capturista_usuario_id: 7,
    responsable_snapshot: { tipo: 'usuario', usuario_id: 9, nombre_completo: tipo === 'nota_evolucion' ? 'Andrea López, profesional ficticia' : 'Lucía Pérez, profesional ficticia',
      cargo_id: 3, cargo_nombre: tipo === 'nota_evolucion' ? 'Médico/a' : 'Enfermera Profesional', cargo_codigo: tipo === 'nota_evolucion' ? 'MED' : 'EP' },
    contenido },
  control: linked ? { numero: 2, fecha: '2026-10-20' } : null,
});

function fixtures() {
  return [
    { name: '01-evolucion-breve', pages: 1, data: base('nota_evolucion',
      'CASO COMPLETAMENTE SINTÉTICO PARA REVISIÓN DEL FORMATO.\n\nPaciente ficticia que acude a consulta prenatal de seguimiento. Refiere bienestar general y movimientos fetales habituales en el contexto del caso simulado. No refiere molestias durante la entrevista.\n\nSe registra una valoración general sin alteraciones descritas para esta demostración. La paciente se encuentra orientada, tranquila y participa en la entrevista. Se revisa la información ficticia del expediente.\n\nSe documenta la atención y la continuidad del seguimiento simulado. Esta narrativa es una muestra de maquetación; no corresponde a una persona ni a una decisión clínica real.', true) },
    { name: '02-enfermeria-breve', pages: 1, data: base('nota_enfermeria',
      'CASO COMPLETAMENTE SINTÉTICO PARA REVISIÓN DEL FORMATO.\n\nSe recibe a la paciente ficticia en el área de atención prenatal. Se identifica con los datos simulados del expediente y se explica el propósito de la entrevista. Permanece despierta, orientada y colaboradora.\n\nSe registran observaciones de confort e higiene y se prepara el espacio de atención. Durante la interacción no se describen cambios en su estado general. Se facilita la comunicación con la profesional responsable.\n\nSe deja constancia de la atención de enfermería y del cierre del registro simulado. No se realizaron procedimientos ni se atendió a una persona real.') },
    { name: '03-evolucion-dos-paginas', pages: 2, data: base('nota_evolucion',
      Array.from({ length: 16 }, (_, i) => `Sección ${i + 1} del caso sintético. Se amplía el registro narrativo de la misma atención ficticia, conservando su fecha y hora originales. La paciente simulada permanece orientada y colaboradora; se organiza la información para su lectura continua.`).join('\n\n'), true) },
    { name: '04-enfermeria-estres', data: base('nota_enfermeria',
      Array.from({ length: 90 }, (_, i) => `Párrafo sintético ${i + 1}: Atención de enfermería con tildes áéíóú, ñ y Ñ. Se conserva cada observación ficticia, su orden y sus espacios.\nContinuación ${i + 1}: registro de demostración, sin datos reales.`).join('\n\n') + '\n\n' + 'PalabraMuyExtensaSinEspaciosÁÑ'.repeat(45) + '\nÚltima línea clínica sintética.') },
  ];
}
module.exports = { base, fixtures };
