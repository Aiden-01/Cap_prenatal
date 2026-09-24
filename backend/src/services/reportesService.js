const ExcelJS = require('exceljs');
const reportesRepository = require('../repositories/reportesRepository');
const reportesPdfService = require('./reportesPdfService');
const { AppError } = require('../utils/appError');
const { getReportExportConfig } = require('../config/reportExportConfig');
const {
  formatGuatemalaDateTime,
  getGuatemalaDateInputValue,
} = require('../utils/guatemalaTime');

function clasificarRiesgo(paciente) {
  if (paciente.tiene_riesgo) return 'ALTO';
  if (paciente.edad < 20 || paciente.edad > 35) return 'MEDIO';
  return 'BAJO';
}

function prepararFilasConRiesgo(rows) {
  return rows.map((row) => ({ ...row, nivel_riesgo: clasificarRiesgo(row) }));
}

function indicadoresRiesgo(rows) {
  return rows.reduce((total, row) => {
    total.total += 1;
    if (row.nivel_riesgo === 'ALTO') total.riesgo_alto += 1;
    else if (row.nivel_riesgo === 'MEDIO') total.riesgo_medio += 1;
    else total.riesgo_bajo += 1;
    return total;
  }, { total: 0, riesgo_alto: 0, riesgo_medio: 0, riesgo_bajo: 0 });
}

function excelDate(value) {
  if (!value) return '';
  if (value instanceof Date) return value;
  const iso = String(value).slice(0, 10);
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? String(value) : date;
}

function displayDate(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toLocaleDateString('es-GT', { timeZone: 'UTC' });
  const iso = String(value).slice(0, 10);
  const [year, month, day] = iso.split('-');
  return year && month && day ? `${day}/${month}/${year}` : String(value);
}

function normalizeCensoRow(row) {
  return {
    expediente: row.no_expediente || '', cui: row.cui || '', nombre: row.nombre_completo || '',
    edad: row.edad ?? '', etnia: row.etnia || '', comunidad: row.comunidad || '',
    fur: row.fur, fpp: row.fpp, primer_control: row.fecha_primer_control,
    semanas: row.semanas_gestacion ?? '', gestas: row.gestas ?? '', partos: row.partos ?? '',
    abortos: row.abortos ?? '', riesgo: row.nivel_riesgo || clasificarRiesgo(row),
    estado: row.estado_embarazo || 'activo',
  };
}

function normalizeOperationalRow(reportId, row) {
  if (reportId === 'comunidades') return { ...row };
  return {
    paciente: row.nombre || '', expediente: row.no_expediente || '', edad: row.edad ?? '',
    comunidad: row.comunidad || '', fpp: row.fpp, dias_restantes: row.dias_restantes ?? '',
    semanas_actuales: row.semanas_actuales ?? '',
    ultimo_control: row.ultimo_control_fecha,
    dias_sin_control: row.dias_sin_control ?? 'Sin controles',
    evaluacion_riesgo: row.fecha_evaluacion_riesgo,
    riesgo: reportId === 'riesgo' ? 'ALTO' : clasificarRiesgo(row),
    seguimiento: row.estado_seguimiento === 'nunca_control' ? 'Nunca ha tenido control' : 'Control atrasado',
  };
}

function normalizePrenatalControlRow(row) {
  return {
    expediente: row.no_expediente || '', paciente: row.paciente || '',
    comunidad: row.comunidad || '', numero_control: row.numero_control,
    fecha_control: row.fecha_control, semanas_gestacion: row.semanas_gestacion ?? '',
    peso: row.peso ?? '',
    presion_arterial: row.pa_sistolica != null && row.pa_diastolica != null
      ? `${row.pa_sistolica}/${row.pa_diastolica}` : '',
    fcf: row.fcf ?? '', presentacion: row.presentacion || '',
    personal_atiende: row.personal_atiende || '',
  };
}

function selectExportColumns(config, selected) {
  const requested = String(selected || '').split(',').map((value) => value.trim()).filter(Boolean);
  const allowed = new Set(config.columns.map(({ key }) => key));
  const unique = [...new Set(requested)];
  if (!unique.length || unique.some((key) => !allowed.has(key))) {
    throw new AppError(400, 'Selecciona al menos una columna válida.', { code: 'INVALID_REPORT_COLUMNS' });
  }
  return config.columns.filter(({ key }) => unique.includes(key));
}

function crearWorkbookReporte({ title, columns, rows, filters, generadoEn }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CAP El Chal';
  workbook.created = new Date();
  workbook.subject = 'Reporte confidencial';
  const sheet = workbook.addWorksheet('Reporte', {
    views: [{ state: 'frozen', ySplit: 5 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  sheet.columns = columns.map(({ key, width }) => ({ key, width }));
  const last = sheet.getColumn(columns.length).letter;
  for (const rowNumber of [1, 2, 3]) sheet.mergeCells(`A${rowNumber}:${last}${rowNumber}`);
  sheet.getCell('A1').value = 'MINISTERIO DE SALUD PUBLICA Y ASISTENCIA SOCIAL · CAP El Chal';
  sheet.getCell('A2').value = title;
  sheet.getCell('A3').value = `${filters} · ${rows.length} registros · Generado: ${generadoEn}`;
  [1, 2, 3].forEach((rowNumber) => {
    const cell = sheet.getCell(`A${rowNumber}`);
    cell.font = { bold: rowNumber < 3, size: rowNumber === 2 ? 14 : 10, color: { argb: rowNumber === 1 ? 'FFFFFFFF' : 'FF172033' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF155E8E' } };
  const header = sheet.getRow(5);
  header.values = columns.map(({ header: label }) => label);
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF155E8E' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  rows.forEach((row, index) => {
    const values = Object.fromEntries(columns.map(({ key, type }) => [key, type === 'date' ? excelDate(row[key]) : row[key]]));
    const added = sheet.addRow(values);
    if (index % 2 === 1) added.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FBFD' } }; });
  });
  columns.filter(({ type }) => type === 'date').forEach(({ key }) => { sheet.getColumn(key).numFmt = 'dd/mm/yyyy'; });
  columns.filter(({ key }) => ['expediente', 'cui'].includes(key)).forEach(({ key }) => { sheet.getColumn(key).numFmt = '@'; });
  sheet.autoFilter = `A5:${last}${Math.max(5, sheet.rowCount)}`;
  return workbook;
}

function crearWorkbookCenso(rows, {
  desde,
  hasta,
  titulo,
  incluirPrimerControl = false,
  generadoEn = formatGuatemalaDateTime(),
} = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CAP El Chal';
  workbook.created = new Date();
  workbook.subject = 'Reporte nominal confidencial';

  const sheet = workbook.addWorksheet('Censo MSPAS', {
    views: [{ state: 'frozen', ySplit: 8 }],
    pageSetup: {
      paperSize: 14,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.2, right: 0.2, top: 0.35, bottom: 0.42, header: 0.1, footer: 0.18 },
      printTitlesRow: '8:8',
    },
    properties: { defaultRowHeight: 16 },
    headerFooter: {
      oddFooter: '&LConfidencial - uso institucional&C CAP El Chal&RPagina &P de &N',
    },
  });

  const columns = [
    { key: 'no', header: '#', width: 4 },
    { key: 'expediente', header: 'No.\nExpediente', width: 12 },
    { key: 'cui', header: 'CUI', width: 14 },
    { key: 'nombre', header: 'Nombre completo', width: 27 },
    { key: 'edad', header: 'Edad', width: 6 },
    { key: 'etnia', header: 'Etnia', width: 10 },
    { key: 'comunidad', header: 'Comunidad', width: 18 },
    { key: 'fur', header: 'FUR', width: 11 },
    { key: 'fpp', header: 'FPP', width: 11 },
    ...(incluirPrimerControl
      ? [{ key: 'primer_control', header: 'Fecha 1er\ncontrol', width: 12 }]
      : []),
    { key: 'semanas', header: 'Sem.', width: 6 },
    { key: 'gestas', header: 'Gestas', width: 7 },
    { key: 'partos', header: 'Partos', width: 7 },
    { key: 'abortos', header: 'Abortos', width: 7 },
    { key: 'riesgo', header: 'Riesgo', width: 9 },
    { key: 'estado', header: 'Estado\nembarazo', width: 11 },
  ];
  sheet.columns = columns.map(({ key, width }) => ({ key, width }));

  const lastColumn = sheet.getColumn(columns.length).letter;
  sheet.mergeCells(`A1:${lastColumn}1`);
  sheet.mergeCells(`A2:${lastColumn}2`);
  sheet.mergeCells(`A3:${lastColumn}3`);
  sheet.getCell('A1').value = 'MINISTERIO DE SALUD PUBLICA Y ASISTENCIA SOCIAL';
  sheet.getCell('A2').value = 'CAP El Chal';
  sheet.getCell('A3').value = titulo;

  for (const [cellRef, size, color] of [
    ['A1', 13, 'FFFFFFFF'], ['A2', 11, 'FF172033'], ['A3', 11, 'FF172033'],
  ]) {
    const cell = sheet.getCell(cellRef);
    cell.font = { bold: true, size, color: { argb: color } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D6FA4' } };
  sheet.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F3FB' } };
  sheet.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDFF3EA' } };

  const metaRanges = [
    ['A5', Math.max(3, Math.floor(columns.length / 3)), `Periodo: ${desde} al ${hasta}`],
    [null, Math.max(3, Math.floor(columns.length / 3)), `Total de captadas: ${rows.length}`],
  ];
  let startIndex = 1;
  for (const [explicitStart, span, value] of metaRanges) {
    if (explicitStart) startIndex = 1;
    const start = sheet.getColumn(startIndex).letter;
    const end = sheet.getColumn(Math.min(columns.length, startIndex + span - 1)).letter;
    sheet.mergeCells(`${start}5:${end}5`);
    const cell = sheet.getCell(`${start}5`);
    cell.value = value;
    cell.font = { bold: true, color: { argb: 'FF155E8E' }, size: 9 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FBFD' } };
    startIndex += span;
  }
  const emissionStart = sheet.getColumn(startIndex).letter;
  sheet.mergeCells(`${emissionStart}5:${lastColumn}5`);
  const emissionCell = sheet.getCell(`${emissionStart}5`);
  emissionCell.value = `Emision en Guatemala: ${generadoEn}`;
  emissionCell.font = { bold: true, color: { argb: 'FF155E8E' }, size: 9 };
  emissionCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  emissionCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FBFD' } };

  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FF9FB6C8' } },
    left: { style: 'thin', color: { argb: 'FF9FB6C8' } },
    bottom: { style: 'thin', color: { argb: 'FF9FB6C8' } },
    right: { style: 'thin', color: { argb: 'FF9FB6C8' } },
  };
  const headerRow = sheet.getRow(8);
  headerRow.values = columns.map((column) => column.header);
  headerRow.height = 29;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 8 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF155E8E' } };
    cell.border = thinBorder;
  });

  rows.forEach((row, index) => {
    const added = sheet.addRow({
      no: index + 1,
      expediente: row.no_expediente ? String(row.no_expediente) : '',
      cui: row.cui ? String(row.cui) : '',
      nombre: row.nombre_completo || '',
      edad: row.edad ?? '',
      etnia: row.etnia || '',
      comunidad: row.comunidad || '',
      fur: excelDate(row.fur),
      fpp: excelDate(row.fpp),
      primer_control: incluirPrimerControl ? excelDate(row.fecha_primer_control) : undefined,
      semanas: row.semanas_gestacion ?? '',
      gestas: row.gestas ?? '',
      partos: row.partos ?? '',
      abortos: row.abortos ?? '',
      riesgo: row.nivel_riesgo,
      estado: row.estado_embarazo || '',
    });
    added.height = 18;
    added.eachCell((cell) => {
      cell.border = thinBorder;
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.font = { color: { argb: 'FF172033' }, size: 8 };
      if (index % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FBFD' } };
      }
    });
    const riskCell = added.getCell('riesgo');
    const style = {
      ALTO: ['FFF8D7DA', 'FFB4232F'],
      MEDIO: ['FFFFF1D6', 'FF995000'],
      BAJO: ['FFDFF3EA', 'FF087A5B'],
    }[row.nivel_riesgo];
    riskCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style[0] } };
    riskCell.font = { bold: true, size: 8, color: { argb: style[1] } };
    riskCell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  const lastDataRow = Math.max(sheet.rowCount, 9);
  sheet.autoFilter = `A8:${lastColumn}${lastDataRow}`;
  for (const key of ['fur', 'fpp', ...(incluirPrimerControl ? ['primer_control'] : [])]) {
    sheet.getColumn(key).numFmt = 'dd/mm/yyyy';
    sheet.getColumn(key).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }
  for (const key of ['expediente', 'cui']) {
    sheet.getColumn(key).numFmt = '@';
  }
  for (const key of ['no', 'edad', 'semanas', 'gestas', 'partos', 'abortos', 'riesgo', 'estado']) {
    sheet.getColumn(key).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }

  sheet.addRow([]);
  const note = sheet.addRow(['Documento confidencial para uso institucional. Proteja los datos nominales de las pacientes.']);
  sheet.mergeCells(`A${note.number}:${lastColumn}${note.number}`);
  note.getCell(1).font = { italic: true, color: { argb: 'FF5F7185' }, size: 8 };
  note.getCell(1).alignment = { horizontal: 'center' };
  return workbook;
}

function crearWorkbookSeguimientoTdap({ nuevasOportunidades, pendientes }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CAP Prenatal';
  workbook.created = new Date();
  workbook.subject = 'Seguimiento operativo Tdap de El Chal';

  const addSheet = (name, rows) => {
    const sheet = workbook.addWorksheet(name, {
      views: [{ state: 'frozen', ySplit: 1 }],
      properties: { defaultRowHeight: 19 },
    });
    sheet.columns = [
      { key: 'first_name', header: 'Primer nombre', width: 22 },
      { key: 'last_name', header: 'Primer apellido', width: 22 },
      { key: 'community', header: 'Comunidad', width: 34 },
    ];
    sheet.getRow(1).height = 24;
    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF155E8E' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    rows.forEach((row, index) => {
      const added = sheet.addRow(row);
      added.eachCell((cell) => {
        cell.alignment = { vertical: 'middle', wrapText: true };
        if (index % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F8FB' } };
        }
      });
    });
    sheet.autoFilter = `A1:C${Math.max(1, sheet.rowCount)}`;
  };

  addSheet('Nuevas oportunidades Tdap', nuevasOportunidades);
  addSheet('Pendientes de Tdap', pendientes);
  return workbook;
}

function createReportesService({
  repository = reportesRepository,
  pdfService = reportesPdfService,
  now = () => new Date(),
  reportWorkbookFactory = crearWorkbookReporte,
} = {}) {
  async function censoMensual({ desde, hasta }) {
    const rows = prepararFilasConRiesgo(await repository.obtenerRowsCensoGeneral());
    return {
      desde: null,
      hasta: null,
      fecha_corte: getGuatemalaDateInputValue(),
      historico_disponible: false,
      total: rows.length,
      indicadores: indicadoresRiesgo(rows),
      pacientes: rows,
    };
  }

  async function censoMensualPrimerControl({ desde, hasta }) {
    const rows = prepararFilasConRiesgo(
      await repository.obtenerRowsCensoPrimerControl(desde, hasta)
    );
    return {
      desde,
      hasta,
      total: rows.length,
      modo: 'primer_control',
      indicadores: indicadoresRiesgo(rows),
      pacientes: rows,
    };
  }

  async function estadisticas() {
    const data = await repository.obtenerEstadisticasBase();
    return {
      embarazos_activos: Number.parseInt(data.embarazosActivos.count, 10),
      total_pacientes_historico: Number.parseInt(data.totalPacientes.count, 10),
      total_pacientes: Number.parseInt(data.totalPacientes.count, 10),
      pacientes_con_riesgo: Number.parseInt(data.pacientesConRiesgo.count, 10),
      controles_este_mes: Number.parseInt(data.controlesEsteMes.count, 10),
    };
  }

  const pacientesConRiesgo = () => repository.obtenerPacientesConRiesgo();
  const proximasAParir = () => repository.obtenerProximasAParir();
  const sinControlReciente = () => repository.obtenerSinControlReciente();

  async function resumenPorComunidad() {
    const comunidades = await repository.obtenerResumenPorComunidad();
    const totales = comunidades.reduce((acc, row) => ({
      embarazos_activos: acc.embarazos_activos + Number(row.embarazos_activos || 0),
      con_riesgo: acc.con_riesgo + Number(row.con_riesgo || 0),
      proximas_a_parir: acc.proximas_a_parir + Number(row.proximas_a_parir || 0),
      sin_control_reciente: acc.sin_control_reciente + Number(row.sin_control_reciente || 0),
    }), { embarazos_activos: 0, con_riesgo: 0, proximas_a_parir: 0, sin_control_reciente: 0 });
    return { fecha_corte: getGuatemalaDateInputValue(), totales, comunidades };
  }

  async function workbookCensoGeneral() {
    const rows = prepararFilasConRiesgo(await repository.obtenerRowsCensoGeneral());
    const fechaCorte = getGuatemalaDateInputValue();
    return {
      workbook: crearWorkbookCenso(rows, {
        desde: fechaCorte,
        hasta: fechaCorte,
        titulo: 'CENSO ACTUAL DE EMBARAZOS ACTIVOS',
        generadoEn: formatGuatemalaDateTime(now()),
      }),
      total: rows.length,
      fechaCorte,
    };
  }

  async function workbookCensoPrimerControl({ desde, hasta }) {
    const rows = prepararFilasConRiesgo(
      await repository.obtenerRowsCensoPrimerControl(desde, hasta)
    );
    return {
      workbook: crearWorkbookCenso(rows, {
        desde,
        hasta,
        titulo: 'CENSO MENSUAL DE CAPTADAS EN PRIMER CONTROL',
        incluirPrimerControl: true,
        generadoEn: formatGuatemalaDateTime(now()),
      }),
      total: rows.length,
    };
  }

  async function pdfCensoPrimerControl({ desde, hasta }) {
    const rows = prepararFilasConRiesgo(
      await repository.obtenerRowsCensoPrimerControl(desde, hasta)
    );
    const pdf = await pdfService.renderCensoPrimerControlPdf({
      rows,
      desde,
      hasta,
      generadoEn: formatGuatemalaDateTime(now()),
    });
    return { pdf, total: rows.length };
  }

  async function controlesPrenatales({ desde, hasta }) {
    const controles = await repository.obtenerControlesPrenatales(desde, hasta);
    return { desde, hasta, total: controles.length, controles };
  }

  async function exportData(reportId, query = {}) {
    const config = getReportExportConfig(reportId);
    if (!config) throw new AppError(404, 'Reporte no encontrado.', { code: 'REPORT_NOT_FOUND' });
    let rawRows;
    if (reportId === 'primer_control') rawRows = await repository.obtenerRowsCensoPrimerControl(query.desde, query.hasta);
    else if (reportId === 'controles_prenatales') rawRows = await repository.obtenerControlesPrenatales(query.desde, query.hasta);
    else if (reportId === 'activos') rawRows = await repository.obtenerRowsCensoGeneral();
    else if (reportId === 'proximas_parto') rawRows = await repository.obtenerProximasAParir();
    else if (reportId === 'sin_control') rawRows = await repository.obtenerSinControlReciente();
    else if (reportId === 'riesgo') rawRows = await repository.obtenerPacientesConRiesgo();
    else rawRows = await repository.obtenerResumenPorComunidad();
    if (!rawRows.length) {
      throw new AppError(409, 'No hay registros para exportar con los filtros actuales.', { code: 'EMPTY_REPORT' });
    }
    const prepared = reportId === 'controles_prenatales'
      ? rawRows.map(normalizePrenatalControlRow)
      : ['primer_control', 'activos'].includes(reportId)
      ? prepararFilasConRiesgo(rawRows).map(normalizeCensoRow)
      : rawRows.map((row) => normalizeOperationalRow(reportId, row));
    const columns = selectExportColumns(config, query.columnas);
    const filters = ['primer_control', 'controles_prenatales'].includes(reportId)
      ? `Filtros activos: ${query.desde} al ${query.hasta}`
      : 'Filtros activos: estado al momento de la consulta';
    return { config, columns, rows: prepared, filters, total: prepared.length };
  }

  async function exportReport(reportId, format, query = {}) {
    const data = await exportData(reportId, query);
    const generadoEn = formatGuatemalaDateTime(now());
    if (format === 'excel') {
      return { ...data, workbook: reportWorkbookFactory({ ...data, title: data.config.title, generadoEn }) };
    }
    const pdfRows = data.rows.map((row) => Object.fromEntries(data.columns.map(({ key, type }) => [
      key, type === 'date' ? displayDate(row[key]) : row[key],
    ])));
    const pdf = await pdfService.renderReportPdf({
      title: data.config.title, columns: data.columns, rows: pdfRows,
      filters: data.filters, generadoEn,
    });
    return { ...data, pdf };
  }

  return {
    controlesPrenatales,
    censoMensual,
    censoMensualPrimerControl,
    estadisticas,
    pacientesConRiesgo,
    proximasAParir,
    sinControlReciente,
    resumenPorComunidad,
    workbookCensoGeneral,
    workbookCensoPrimerControl,
    pdfCensoPrimerControl,
    exportData,
    exportReport,
  };
}

module.exports = {
  ...createReportesService(),
  clasificarRiesgo,
  crearWorkbookCenso,
  crearWorkbookSeguimientoTdap,
  crearWorkbookReporte,
  createReportesService,
  normalizeCensoRow,
  normalizeOperationalRow,
  selectExportColumns,
  indicadoresRiesgo,
  prepararFilasConRiesgo,
};
