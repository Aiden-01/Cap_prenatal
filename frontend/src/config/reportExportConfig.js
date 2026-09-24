import { REPORTES } from "../utils/reportes";

const column = (id, label) => ({ id, label });

export const REPORT_EXPORT_CONFIG = Object.freeze({
  [REPORTES.CONTROLES_PRENATALES]: {
    title: "Controles prenatales",
    endpoint: "/reportes/controles-prenatales",
    columns: [
      column("expediente", "Expediente"), column("paciente", "Paciente"),
      column("comunidad", "Comunidad"), column("numero_control", "Número de control"),
      column("fecha_control", "Fecha del control"),
      column("semanas_gestacion", "Semanas de gestación"), column("peso", "Peso (kg)"),
      column("presion_arterial", "Presión arterial"), column("fcf", "FCF"),
      column("presentacion", "Presentación"), column("personal_atiende", "Personal que atendió"),
    ],
  },
  [REPORTES.PRIMER_CONTROL]: {
    title: "Captadas en primer control",
    endpoint: "/reportes/censo/primer-control",
    columns: [
      column("expediente", "Expediente"), column("cui", "CUI"),
      column("nombre", "Nombre completo"), column("edad", "Edad"),
      column("etnia", "Etnia"), column("comunidad", "Comunidad"),
      column("fur", "FUR"), column("fpp", "FPP"),
      column("primer_control", "Primer control"), column("semanas", "Sem."),
      column("gestas", "Gestas"), column("partos", "Partos"),
      column("abortos", "Abortos"), column("riesgo", "Riesgo"),
      column("estado", "Estado"),
    ],
  },
  [REPORTES.ACTIVOS]: {
    title: "Embarazos activos",
    endpoint: "/reportes/censo",
    columns: [
      column("expediente", "Expediente"), column("cui", "CUI"),
      column("nombre", "Nombre completo"), column("edad", "Edad"),
      column("etnia", "Etnia"), column("comunidad", "Comunidad"),
      column("fur", "FUR"), column("fpp", "FPP"), column("semanas", "Sem."),
      column("gestas", "Gestas"), column("partos", "Partos"),
      column("abortos", "Abortos"), column("riesgo", "Riesgo"),
      column("estado", "Estado"),
    ],
  },
  [REPORTES.PROXIMAS_PARTO]: {
    title: "Próximas a dar a luz",
    endpoint: "/reportes/proximas-a-parir",
    columns: [
      column("paciente", "Paciente"), column("expediente", "Expediente"),
      column("comunidad", "Comunidad"), column("fpp", "FPP"),
      column("dias_restantes", "Días restantes"),
      column("semanas_actuales", "Semanas actuales"), column("riesgo", "Riesgo"),
    ],
  },
  [REPORTES.SIN_CONTROL]: {
    title: "Sin control reciente",
    endpoint: "/reportes/sin-control-reciente",
    columns: [
      column("paciente", "Paciente"), column("expediente", "Expediente"),
      column("comunidad", "Comunidad"), column("ultimo_control", "Último control"),
      column("dias_sin_control", "Días sin control"), column("fpp", "FPP"),
      column("riesgo", "Riesgo"), column("seguimiento", "Seguimiento"),
    ],
  },
  [REPORTES.RIESGO]: {
    title: "Riesgo obstétrico",
    endpoint: "/reportes/pacientes-riesgo",
    columns: [
      column("paciente", "Paciente"), column("expediente", "Expediente"),
      column("edad", "Edad"), column("comunidad", "Comunidad"),
      column("fpp", "FPP"), column("semanas_actuales", "Semanas actuales"),
      column("evaluacion_riesgo", "Evaluación de riesgo"), column("riesgo", "Riesgo"),
    ],
  },
  [REPORTES.COMUNIDADES]: {
    title: "Resumen por comunidad",
    endpoint: "/reportes/resumen-comunidades",
    columns: [
      column("comunidad", "Comunidad"), column("territorio", "Territorio"),
      column("sector", "Sector"), column("embarazos_activos", "Embarazos activos"),
      column("con_riesgo", "Con riesgo"),
      column("proximas_a_parir", "Próximas a parir"),
      column("sin_control_reciente", "Sin control reciente"),
    ],
  },
});

export function getReportExportConfig(reportId) {
  return REPORT_EXPORT_CONFIG[reportId];
}
