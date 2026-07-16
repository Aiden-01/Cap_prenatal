import { getGuatemalaDateInputValue } from "./guatemalaTime.js";

export const REPORTES = Object.freeze({
  PRIMER_CONTROL: "primer_control",
  ACTIVOS: "activos",
  PROXIMAS_PARTO: "proximas_parto",
  SIN_CONTROL: "sin_control",
  RIESGO: "riesgo",
  COMUNIDADES: "comunidades",
});

export function getDefaultReportPeriod(now = new Date()) {
  const hasta = getGuatemalaDateInputValue(now);
  return { desde: `${hasta.slice(0, 8)}01`, hasta };
}

export function getReportRiskLevel(paciente) {
  if (paciente?.nivel_riesgo) return String(paciente.nivel_riesgo).toLowerCase();
  if (paciente?.tiene_riesgo) return "alto";
  if (paciente?.edad < 20 || paciente?.edad > 35) return "medio";
  return "bajo";
}

export function safeDownloadFilename(contentDisposition, fallback) {
  const header = String(contentDisposition || "");
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i);
  const basic = header.match(/filename="?([^";]+)"?/i);
  let candidate = utf8?.[1] || basic?.[1] || fallback;
  try {
    candidate = decodeURIComponent(candidate);
  } catch {
    // Se conserva el nombre ya sanitizado por el backend.
  }
  return Array.from(String(candidate || fallback).replace(/[\\/]/g, "-"))
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? "-" : character;
    })
    .join("")
    .slice(0, 140);
}
