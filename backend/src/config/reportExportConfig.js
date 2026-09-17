const column = (key, header, width = 16, type = 'text') => ({ key, header, width, type });

const REPORT_EXPORT_CONFIG = Object.freeze({
  primer_control: {
    title: 'Captadas en primer control', slug: 'Captadas_primer_control', source: 'primerControl',
    columns: [
      column('expediente', 'Expediente', 12), column('cui', 'CUI', 14),
      column('nombre', 'Nombre completo', 28), column('edad', 'Edad', 7, 'number'),
      column('etnia', 'Etnia', 12), column('comunidad', 'Comunidad', 19),
      column('fur', 'FUR', 12, 'date'), column('fpp', 'FPP', 12, 'date'),
      column('primer_control', 'Primer control', 14, 'date'), column('semanas', 'Sem.', 7, 'number'),
      column('gestas', 'Gestas', 8, 'number'), column('partos', 'Partos', 8, 'number'),
      column('abortos', 'Abortos', 8, 'number'), column('riesgo', 'Riesgo', 10),
      column('estado', 'Estado', 12),
    ],
  },
  activos: {
    title: 'Embarazos activos', slug: 'Embarazos_activos', source: 'activos',
    columns: [
      column('expediente', 'Expediente', 12), column('cui', 'CUI', 14),
      column('nombre', 'Nombre completo', 28), column('edad', 'Edad', 7, 'number'),
      column('etnia', 'Etnia', 12), column('comunidad', 'Comunidad', 19),
      column('fur', 'FUR', 12, 'date'), column('fpp', 'FPP', 12, 'date'),
      column('semanas', 'Sem.', 7, 'number'), column('gestas', 'Gestas', 8, 'number'),
      column('partos', 'Partos', 8, 'number'), column('abortos', 'Abortos', 8, 'number'),
      column('riesgo', 'Riesgo', 10), column('estado', 'Estado', 12),
    ],
  },
  proximas_parto: {
    title: 'Próximas a dar a luz', slug: 'Proximas_a_dar_a_luz', source: 'proximasParto',
    columns: [
      column('paciente', 'Paciente', 28), column('expediente', 'Expediente', 12),
      column('comunidad', 'Comunidad', 19), column('fpp', 'FPP', 12, 'date'),
      column('dias_restantes', 'Días restantes', 14, 'number'),
      column('semanas_actuales', 'Semanas actuales', 15, 'number'), column('riesgo', 'Riesgo', 10),
    ],
  },
  sin_control: {
    title: 'Sin control reciente', slug: 'Sin_control_reciente', source: 'sinControl',
    columns: [
      column('paciente', 'Paciente', 28), column('expediente', 'Expediente', 12),
      column('comunidad', 'Comunidad', 19), column('ultimo_control', 'Último control', 14, 'date'),
      column('dias_sin_control', 'Días sin control', 15), column('fpp', 'FPP', 12, 'date'),
      column('riesgo', 'Riesgo', 10), column('seguimiento', 'Seguimiento', 18),
    ],
  },
  riesgo: {
    title: 'Riesgo obstétrico', slug: 'Riesgo_obstetrico', source: 'riesgo',
    columns: [
      column('paciente', 'Paciente', 28), column('expediente', 'Expediente', 12),
      column('edad', 'Edad', 7, 'number'), column('comunidad', 'Comunidad', 19),
      column('fpp', 'FPP', 12, 'date'), column('semanas_actuales', 'Semanas actuales', 15, 'number'),
      column('evaluacion_riesgo', 'Evaluación de riesgo', 18, 'date'), column('riesgo', 'Riesgo', 10),
    ],
  },
  comunidades: {
    title: 'Resumen por comunidad', slug: 'Resumen_por_comunidad', source: 'comunidades',
    columns: [
      column('comunidad', 'Comunidad', 24), column('territorio', 'Territorio', 12),
      column('sector', 'Sector', 12), column('embarazos_activos', 'Embarazos activos', 17, 'number'),
      column('con_riesgo', 'Con riesgo', 13, 'number'),
      column('proximas_a_parir', 'Próximas a parir', 16, 'number'),
      column('sin_control_reciente', 'Sin control reciente', 19, 'number'),
    ],
  },
});

function getReportExportConfig(reportId) {
  return REPORT_EXPORT_CONFIG[reportId];
}

module.exports = { REPORT_EXPORT_CONFIG, getReportExportConfig };
