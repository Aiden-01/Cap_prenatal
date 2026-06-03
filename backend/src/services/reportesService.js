const ExcelJS = require('exceljs');
const reportesRepository = require('../repositories/reportesRepository');

async function censoMensual({ desde, hasta }) {
  const rows = await reportesRepository.obtenerRowsCensoGeneral(desde, hasta);
  return { desde, hasta, total: rows.length, pacientes: rows };
}

async function censoMensualPrimerControl({ desde, hasta }) {
  const rows = await reportesRepository.obtenerRowsCensoPrimerControl(desde, hasta);
  return {
    desde,
    hasta,
    total: rows.length,
    modo: 'primer_control',
    pacientes: rows,
  };
}

async function estadisticas() {
  const data = await reportesRepository.obtenerEstadisticasBase();
  return {
    total_pacientes: parseInt(data.totalPacientes.count, 10),
    pacientes_con_riesgo: parseInt(data.pacientesConRiesgo.count, 10),
    controles_este_mes: parseInt(data.controlesEsteMes.count, 10),
    proximas_citas: data.proximasCitas,
  };
}

async function pacientesConRiesgo() {
  return reportesRepository.obtenerPacientesConRiesgo();
}

async function proximasAParir() {
  return reportesRepository.obtenerProximasAParir();
}

async function sinControlReciente() {
  return reportesRepository.obtenerSinControlReciente();
}

function getNivelRiesgo(paciente) {
  if (paciente.riesgo) return 'ALTO';
  if (paciente.edad < 20 || paciente.edad > 35) return 'MEDIO';
  return 'BAJO';
}

function formatFecha(value) {
  if (!value) return '';
  return value instanceof Date ? value : new Date(value);
}

function crearWorkbookCenso(rows, { desde, hasta, titulo }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CAP El Chal';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Censo MSPAS', {
    views: [{ state: 'frozen', ySplit: 8 }],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
    properties: { defaultRowHeight: 18 },
  });

  const colors = {
    primary: 'FF1D6FA4',
    primaryDark: 'FF155E8E',
    surface: 'FFF8FBFD',
    border: 'FF9FB6C8',
    text: 'FF1A2535',
    muted: 'FF5F7185',
    dangerBg: 'FFF8D7DA',
    dangerText: 'FFB4232F',
    warnBg: 'FFFFF1D6',
    warnText: 'FFB05A00',
    okBg: 'FFDFF3EA',
    okText: 'FF087A5B',
  };

  const thinBorder = {
    top: { style: 'thin', color: { argb: colors.border } },
    left: { style: 'thin', color: { argb: colors.border } },
    bottom: { style: 'thin', color: { argb: colors.border } },
    right: { style: 'thin', color: { argb: colors.border } },
  };

  sheet.columns = [
    { key: 'no', width: 6 },
    { key: 'exp', width: 18 },
    { key: 'cui', width: 17 },
    { key: 'nombre', width: 34 },
    { key: 'edad', width: 8 },
    { key: 'etnia', width: 16 },
    { key: 'municipio', width: 18 },
    { key: 'fur', width: 13 },
    { key: 'fpp', width: 13 },
    { key: 'sem', width: 10 },
    { key: 'gestas', width: 9 },
    { key: 'partos', width: 9 },
    { key: 'abortos', width: 9 },
    { key: 'riesgo', width: 12 },
  ];

  sheet.mergeCells('A1:N1');
  sheet.mergeCells('A2:N2');
  sheet.mergeCells('A3:N3');
  sheet.mergeCells('A5:C5');
  sheet.mergeCells('D5:F5');
  sheet.mergeCells('G5:I5');
  sheet.mergeCells('J5:N5');

  sheet.getCell('A1').value = 'MINISTERIO DE SALUD PUBLICA Y ASISTENCIA SOCIAL';
  sheet.getCell('A2').value = 'CAP El Chal';
  sheet.getCell('A3').value = titulo;
  sheet.getCell('A5').value = `Periodo: ${desde} al ${hasta}`;
  sheet.getCell('D5').value = `Total pacientes: ${rows.length}`;
  sheet.getCell('G5').value = `Fecha de emision: ${new Date().toLocaleDateString('es-GT')}`;
  sheet.getCell('J5').value = 'Clasificacion de riesgo: Alto / Medio / Bajo';

  ['A1', 'A2', 'A3'].forEach((cellRef, index) => {
    const cell = sheet.getCell(cellRef);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.font = {
      bold: true,
      color: { argb: index === 0 ? 'FFFFFFFF' : colors.text },
      size: index === 0 ? 14 : index === 1 ? 12 : 13,
    };
  });

  sheet.getRow(1).height = 24;
  sheet.getRow(2).height = 22;
  sheet.getRow(3).height = 24;
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.primary } };
  sheet.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F3FB' } };
  sheet.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDFF3EA' } };

  ['A5', 'D5', 'G5', 'J5'].forEach((cellRef) => {
    const cell = sheet.getCell(cellRef);
    cell.font = { bold: true, color: { argb: colors.primaryDark }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.surface } };
    cell.border = thinBorder;
  });

  const headerRow = sheet.getRow(8);
  headerRow.values = [
    '#', 'No. Expediente', 'CUI', 'Nombre completo', 'Edad', 'Etnia',
    'Municipio', 'FUR', 'FPP', 'Sem.', 'Gestas', 'Partos', 'Abortos', 'Riesgo',
  ];
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.primaryDark } };
    cell.border = thinBorder;
  });

  rows.forEach((p, index) => {
    const nivelRiesgo = getNivelRiesgo(p);
    const row = sheet.addRow({
      no: index + 1,
      exp: p.no_expediente || '',
      cui: p.cui || '',
      nombre: p.nombre_completo || '',
      edad: p.edad ?? '',
      etnia: p.etnia || '',
      municipio: p.municipio || '',
      fur: formatFecha(p.fur),
      fpp: formatFecha(p.fpp),
      sem: p.semanas ?? '',
      gestas: p.gestas_previas ?? p.no_embarazos ?? '',
      partos: p.partos ?? p.no_partos ?? '',
      abortos: p.abortos ?? p.no_abortos ?? '',
      riesgo: nivelRiesgo,
    });

    row.eachCell((cell) => {
      cell.border = thinBorder;
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.font = { color: { argb: colors.text }, size: 10 };
    });

    if (index % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.surface } };
      });
    }

    const riesgoCell = row.getCell('riesgo');
    const riesgoStyle = {
      ALTO: { fill: colors.dangerBg, font: colors.dangerText },
      MEDIO: { fill: colors.warnBg, font: colors.warnText },
      BAJO: { fill: colors.okBg, font: colors.okText },
    }[nivelRiesgo];

    riesgoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: riesgoStyle.fill } };
    riesgoCell.font = { bold: true, color: { argb: riesgoStyle.font }, size: 10 };
    riesgoCell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  const lastRow = Math.max(sheet.rowCount, 9);
  sheet.autoFilter = `A8:N${lastRow}`;
  sheet.getColumn('fur').numFmt = 'dd/mm/yyyy';
  sheet.getColumn('fpp').numFmt = 'dd/mm/yyyy';

  ['A', 'E', 'H', 'I', 'J', 'K', 'L', 'M', 'N'].forEach((col) => {
    sheet.getColumn(col).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });

  sheet.addRow([]);
  const footerRow = sheet.addRow([
    '', '', '', '', '', '', '', '', '', '', '', '', 'Generado por:',
    'CAP El Chal - ' + new Date().toLocaleDateString('es-GT'),
  ]);
  footerRow.eachCell((cell) => {
    cell.font = { italic: true, color: { argb: colors.muted }, size: 9 };
  });

  return workbook;
}

async function workbookCensoGeneral({ desde, hasta }) {
  const rows = await reportesRepository.obtenerRowsCensoGeneral(desde, hasta);
  return crearWorkbookCenso(rows, {
    desde,
    hasta,
    titulo: 'CENSO NOMINAL DE MUJERES EMBARAZADAS',
  });
}

async function workbookCensoPrimerControl({ desde, hasta }) {
  const rows = await reportesRepository.obtenerRowsCensoPrimerControl(desde, hasta);
  return crearWorkbookCenso(rows, {
    desde,
    hasta,
    titulo: 'CENSO NOMINAL DE EMBARAZADAS - PRIMER CONTROL',
  });
}

module.exports = {
  censoMensual,
  censoMensualPrimerControl,
  estadisticas,
  pacientesConRiesgo,
  proximasAParir,
  sinControlReciente,
  workbookCensoGeneral,
  workbookCensoPrimerControl,
};
