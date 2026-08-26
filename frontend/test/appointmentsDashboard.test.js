import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  WEEKDAY_LABELS,
  addDaysDateOnly,
  formatAccessibleDate,
  formatDateDisplay,
  formatMonthLabel,
  getCalendarDays,
  getVisibleCalendarRange,
  groupAppointmentsByDate,
  shiftMonth,
  todayInGuatemala,
} from "../src/utils/appointmentCalendar.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dirname, "..");
const read = (relativePath) => fs.readFile(path.join(root, relativePath), "utf8");

test("calendario construye seis semanas domingo-sabado y consulta el rango visual", () => {
  assert.deepEqual(WEEKDAY_LABELS, ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"]);
  assert.deepEqual(getVisibleCalendarRange("2026-08-01"), {
    from: "2026-07-26",
    to: "2026-09-05",
  });
  const days = getCalendarDays("2026-08-01");
  assert.equal(days.length, 42);
  assert.equal(days[0], "2026-07-26");
  assert.equal(days.at(-1), "2026-09-05");
});

test("navegacion mensual cruza años y etiqueta mes sin depender del timezone", () => {
  assert.equal(shiftMonth("2026-01-01", -1), "2025-12-01");
  assert.equal(shiftMonth("2026-12-01", 1), "2027-01-01");
  assert.equal(formatMonthLabel("2026-08-01"), "Agosto 2026");
  assert.equal(todayInGuatemala(new Date("2026-08-27T03:30:00.000Z")), "2026-08-26");
});

test("date-only conserva el dia almacenado y muestra DD-MM-YYYY", () => {
  assert.equal(formatDateDisplay("2026-08-25"), "25-08-2026");
  assert.match(formatAccessibleDate("2026-08-25"), /25 de agosto de 2026/i);
  assert.equal(addDaysDateOnly("2026-08-25", 1), "2026-08-26");
  assert.equal(addDaysDateOnly("2026-03-01", -1), "2026-02-28");
});

test("multiples citas del mismo dia permanecen agrupadas sin perder estados", () => {
  const items = [
    { id: "1", date: "2026-08-25", status: "programada" },
    { id: "2", date: "2026-08-25", status: "atendida" },
    { id: "3", date: "2026-08-25", status: "cancelada" },
    { id: "4", date: "2026-08-25", status: "reprogramada" },
  ];
  assert.deepEqual(groupAppointmentsByDate(items).get("2026-08-25"), items);
});

test("dashboard reemplaza la ventana de siete dias por el calendario y separa sus cargas", async () => {
  const dashboard = await read("src/pages/Dashboard.jsx");
  assert.match(dashboard, /Calendario de citas/);
  assert.match(dashboard, /<AppointmentCalendar/);
  assert.match(dashboard, /Cargando estadísticas/);
  assert.doesNotMatch(dashboard, /Citas en los próximos 7 días|proximas_citas|cita_siguiente/);
  assert.ok(dashboard.indexOf("<AppointmentCalendar") > dashboard.indexOf("Cargando estadísticas"));
});

test("calendario hace una solicitud por rango y evita respuestas atrasadas", async () => {
  const source = await read("src/components/AppointmentCalendar.jsx");
  assert.match(source, /api\.get\("\/citas\/calendario"/);
  assert.match(source, /params: \{ from: range\.from, to: range\.to \}/);
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /requestIdentity\.current !== identity/);
  assert.match(source, /return \(\) => controller\.abort\(\)/);
});

test("calendario conserva el mes durante loading y distingue error, retry y vacio", async () => {
  const source = await read("src/components/AppointmentCalendar.jsx");
  assert.match(source, /Cargando citas del mes/);
  assert.match(source, /calendar-skeleton-lines/);
  assert.match(source, /No se pudieron cargar las citas del mes/);
  assert.match(source, />\s*Reintentar\s*</);
  assert.match(source, /No hay citas registradas en este mes/);
  assert.match(source, /aria-busy=\{loading\}/);
});

test("cuatro estados usan icono, texto accesible, leyenda y tratamiento terminal", async () => {
  const [calendar, statuses, css] = await Promise.all([
    read("src/components/AppointmentCalendar.jsx"),
    read("src/components/appointmentStatusMeta.js"),
    read("src/components/appointment-calendar.css"),
  ]);
  for (const status of ["programada", "atendida", "cancelada", "reprogramada"]) {
    assert.match(statuses, new RegExp(`${status}:`));
    assert.match(css, new RegExp(`\\.is-${status}`));
  }
  assert.match(calendar, /appointment-status-legend/);
  assert.match(calendar, /AppointmentStatusIcon/);
  assert.match(css, /text-decoration: line-through/);
});

test("citas minimizan contenido visible y ofrecen nombre accesible completo", async () => {
  const source = await read("src/components/AppointmentCalendar.jsx");
  assert.match(source, /appointment\.patient_name/);
  assert.match(source, /appointment\.community/);
  assert.match(source, /formatAccessibleDate\(appointment\.date\)/);
  assert.match(source, /aria-label=\{appointmentAccessibleName\(appointment\)\}/);
  assert.doesNotMatch(source, /no_expediente|cui|telefono|direcci[oó]n|edad_gestacional|vacunas|laboratorios/i);
});

test("mas de tres citas usa +N mas y abre la lista completa del dia", async () => {
  const source = await read("src/components/AppointmentCalendar.jsx");
  assert.match(source, /MAX_EVENTS_PER_CELL = 3/);
  assert.match(source, /dayItems\.slice\(0, MAX_EVENTS_PER_CELL\)/);
  assert.match(source, /\+\{extra\} más/);
  assert.match(source, /<DayAgenda/);
  assert.match(source, /items\.map\(\(appointment\)/);
});

test("detalle permite expediente y solo programa acciones para cita modificable", async () => {
  const source = await read("src/components/AppointmentDetailDialog.jsx");
  assert.match(source, /appointment\.status === "programada" && appointment\.editable && canManage/);
  assert.match(source, /Ver expediente/);
  assert.match(source, /Reprogramar/);
  assert.match(source, /Cancelar cita/);
  assert.match(source, /appointment\.status === "reprogramada" && appointment\.rescheduled_to/);
  assert.match(source, /Reprogramada para/);
});

test("reprogramar conserva original, agrega hija visible y cancelar conserva historial", async () => {
  const source = await read("src/components/AppointmentCalendar.jsx");
  assert.match(source, /status: "reprogramada"[\s\S]*rescheduled_to: newDate/);
  assert.match(source, /data\?\.cita_nueva\?\.id/);
  assert.match(source, /status: "programada"/);
  assert.match(source, /status: "cancelada", editable: false/);
  assert.doesNotMatch(source, /filter\(.*appointment\.id/);
  assert.match(source, /Cita reprogramada correctamente/);
  assert.match(source, /Cita cancelada correctamente/);
});

test("permisos separan lectura pacientes.ver de edicion controles.editar", async () => {
  const dashboard = await read("src/pages/Dashboard.jsx");
  assert.match(dashboard, /permisos\?\.includes\("pacientes\.ver"\)/);
  assert.match(dashboard, /permisos\?\.includes\("controles\.editar"\)/);
  assert.match(dashboard, /canViewAppointments \? \(/);
  assert.match(dashboard, /canManageAppointments=\{canManageAppointments\}/);
});

test("teclado, Escape, foco y dialogos mantienen el patron accesible", async () => {
  const [calendar, detail, action] = await Promise.all([
    read("src/components/AppointmentCalendar.jsx"),
    read("src/components/AppointmentDetailDialog.jsx"),
    read("src/components/AppointmentActionDialog.jsx"),
  ]);
  assert.match(calendar, /<table className="appointment-calendar-table">/);
  assert.doesNotMatch(calendar, /role="grid"/);
  assert.match(calendar, /type="button"/);
  for (const source of [detail, action]) {
    assert.match(source, /role="dialog"/);
    assert.match(source, /aria-modal="true"/);
    assert.match(source, /event\.key === "Escape"/);
    assert.match(source, /event\.key !== "Tab"/);
    assert.match(source, /event\.shiftKey/);
    assert.match(source, /requestAnimationFrame/);
  }
});

test("responsive conserva tabla en tablet y usa agenda compacta en movil sin overflow global", async () => {
  const css = await read("src/components/appointment-calendar.css");
  assert.match(css, /table-layout: fixed/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.calendar-events \{ display: none/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.appointment-day-agenda \{ display: block/);
  assert.match(css, /max-width: 100%[\s\S]*overflow: hidden/);
  assert.doesNotMatch(css, /overflow-x: auto/);
});

test("dark y light reutilizan tokens sin colores semanticos hardcodeados", async () => {
  const css = await read("src/components/appointment-calendar.css");
  assert.match(css, /var\(--surface\)/);
  assert.match(css, /var\(--text\)/);
  assert.match(css, /var\(--primary-lt\)/);
  assert.match(css, /var\(--accent-lt\)/);
  assert.match(css, /var\(--danger-lt\)/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}/i);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("calendario no crea citas ni implementa drag and drop", async () => {
  const source = await read("src/components/AppointmentCalendar.jsx");
  assert.doesNotMatch(source, /Nueva cita|Crear evento|Agregar cita|draggable|onDrag|onDrop/);
});

test("dialogo de CITAS-01B valida nueva fecha date-only y conserva historial", async () => {
  const source = await read("src/components/AppointmentActionDialog.jsx");
  assert.match(source, /type="date"/);
  assert.match(source, /min=\{todayGuatemala\(\)\}/);
  assert.match(source, /La nueva fecha debe ser diferente/);
  assert.match(source, /El registro permanecerá en el historial/);
  assert.match(source, /Confirmar nueva fecha/);
});
