const pool = require('../db/pool');
const ExcelJS = require('exceljs');

// ============================================================
// GET /api/reportes/censo?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// ============================================================
async function censoMensual(req, res) {
  const { desde, hasta } = req.query;

  if (!desde || !hasta) {
    return res.status(400).json({
      error: 'Parametros desde y hasta son requeridos (YYYY-MM-DD)',
    });
  }

  try {
    const { rows } = await pool.query(
      `SELECT
        p.id,
        p.no_expediente,
        p.cui,
        p.nombres,
        p.apellidos,
        p.nombres || ' ' || p.apellidos  AS nombre_completo,
        DATE_PART('year', AGE(CURRENT_DATE, p.fecha_nacimiento))::INTEGER AS edad,
        p.pueblo                          AS grupo_etnico,
        p.municipio,
        p.comunidad,
        p.fur,
        p.fpp,
        p.gestas_previas                  AS no_embarazos,
        p.partos_vaginales + p.cesareas   AS no_partos,
        p.cesareas                        AS no_cesareas,
        p.abortos                         AS no_abortos,
        p.nacidos_vivos                   AS hijos_vivos,
        p.muertos_antes_1sem + p.muertos_despues_1sem AS hijos_muertos,
        EXTRACT(WEEK FROM AGE(CURRENT_DATE, p.fur))::INTEGER AS semanas_gestacion,
        COALESCE(r.tiene_riesgo, FALSE)   AS tiene_riesgo,
        p.created_at
      FROM pacientes p
      LEFT JOIN fichas_riesgo_obstetrico r ON r.paciente_id = p.id
      WHERE DATE(p.created_at) BETWEEN $1 AND $2
      ORDER BY p.apellidos ASC, p.nombres ASC`,
      [desde, hasta]
    );

    return res.json({ desde, hasta, total: rows.length, pacientes: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al generar censo' });
  }
}

// ============================================================
// GET /api/reportes/censo/excel?desde=...&hasta=...
// ============================================================
async function exportarCensoExcel(req, res) {
  const { desde, hasta } = req.query;

  if (!desde || !hasta) {
    return res.status(400).json({ error: 'Parametros requeridos' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT
        p.no_expediente,
        p.cui,
        p.nombres || ' ' || p.apellidos  AS nombre_completo,
        DATE_PART('year', AGE(CURRENT_DATE, p.fecha_nacimiento))::INTEGER AS edad,
        p.pueblo                          AS etnia,
        p.municipio,
        p.fur,
        p.fpp,
        EXTRACT(WEEK FROM AGE(CURRENT_DATE, p.fur))::INTEGER AS semanas,
        p.gestas_previas,
        p.partos_vaginales + p.cesareas   AS partos,
        p.abortos,
        COALESCE(r.tiene_riesgo, FALSE)   AS riesgo
      FROM pacientes p
      LEFT JOIN fichas_riesgo_obstetrico r ON r.paciente_id = p.id
      WHERE DATE(p.created_at) BETWEEN $1 AND $2
      ORDER BY p.apellidos ASC, p.nombres ASC`,
      [desde, hasta]
    );

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

    const getNivelRiesgo = (paciente) => {
      if (paciente.riesgo) return 'ALTO';
      if (paciente.edad < 20 || paciente.edad > 35) return 'MEDIO';
      return 'BAJO';
    };

    const formatFecha = (value) => {
      if (!value) return '';
      return value instanceof Date ? value : new Date(value);
    };

    sheet.columns = [
      { key: 'no',        width: 6  },
      { key: 'exp',       width: 18 },
      { key: 'cui',       width: 17 },
      { key: 'nombre',    width: 34 },
      { key: 'edad',      width: 8  },
      { key: 'etnia',     width: 16 },
      { key: 'municipio', width: 18 },
      { key: 'fur',       width: 13 },
      { key: 'fpp',       width: 13 },
      { key: 'sem',       width: 10 },
      { key: 'gestas',    width: 9  },
      { key: 'partos',    width: 9  },
      { key: 'abortos',   width: 9  },
      { key: 'riesgo',    width: 12 },
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
    sheet.getCell('A3').value = 'CENSO NOMINAL DE MUJERES EMBARAZADAS';
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
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: colors.primary },
    };
    sheet.getRow(2).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8F3FB' },
    };
    sheet.getRow(3).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFDFF3EA' },
    };

    ['A5', 'D5', 'G5', 'J5'].forEach((cellRef) => {
      const cell = sheet.getCell(cellRef);
      cell.font = { bold: true, color: { argb: colors.primaryDark }, size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: colors.surface },
      };
      cell.border = thinBorder;
    });

    const headerRow = sheet.getRow(8);
    headerRow.values = [
      '#',
      'No. Expediente',
      'CUI',
      'Nombre completo',
      'Edad',
      'Etnia',
      'Municipio',
      'FUR',
      'FPP',
      'Sem.',
      'Gestas',
      'Partos',
      'Abortos',
      'Riesgo',
    ];
    headerRow.height = 24;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: colors.primaryDark },
      };
      cell.border = thinBorder;
    });

    rows.forEach((p, index) => {
      const nivelRiesgo = getNivelRiesgo(p);
      const row = sheet.addRow({
        no:        index + 1,
        exp:       p.no_expediente || '',
        cui:       p.cui || '',
        nombre:    p.nombre_completo || '',
        edad:      p.edad ?? '',
        etnia:     p.etnia || '',
        municipio: p.municipio || '',
        fur:       formatFecha(p.fur),
        fpp:       formatFecha(p.fpp),
        sem:       p.semanas ?? '',
        gestas:    p.gestas_previas ?? '',
        partos:    p.partos ?? '',
        abortos:   p.abortos ?? '',
        riesgo:    nivelRiesgo,
      });

      row.eachCell((cell) => {
        cell.border = thinBorder;
        cell.alignment = { vertical: 'middle', wrapText: true };
        cell.font = { color: { argb: colors.text }, size: 10 };
      });

      if (index % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: colors.surface },
          };
        });
      }

      const riesgoCell = row.getCell('riesgo');
      const riesgoStyle = {
        ALTO:  { fill: colors.dangerBg, font: colors.dangerText },
        MEDIO: { fill: colors.warnBg,   font: colors.warnText },
        BAJO:  { fill: colors.okBg,     font: colors.okText },
      }[nivelRiesgo];

      riesgoCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: riesgoStyle.fill },
      };
      riesgoCell.font = { bold: true, color: { argb: riesgoStyle.font }, size: 10 };
      riesgoCell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    const lastRow = Math.max(sheet.rowCount, 9);
    sheet.autoFilter = `A8:N${lastRow}`;
    sheet.getColumn('fur').numFmt = 'dd/mm/yyyy';
    sheet.getColumn('fpp').numFmt = 'dd/mm/yyyy';

    ['A', 'E', 'H', 'I', 'J', 'K', 'L', 'M', 'N'].forEach((col) => {
      sheet.getColumn(col).alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };
    });

    sheet.addRow([]);
    const footerRow = sheet.addRow([
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'Generado por:',
      'CAP El Chal - ' + new Date().toLocaleDateString('es-GT'),
    ]);
    footerRow.eachCell((cell) => {
      cell.font = { italic: true, color: { argb: colors.muted }, size: 9 };
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=censo_${desde}_${hasta}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error exportando Excel' });
  }
}

// ============================================================
// GET /api/reportes/estadisticas
// ============================================================
async function estadisticas(req, res) {
  try {
    const [
      totalPacientes,
      pacientesConRiesgo,
      controlesEsteMes,
      proximasCitas,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM pacientes'),
      pool.query(
        'SELECT COUNT(*) FROM fichas_riesgo_obstetrico WHERE tiene_riesgo = TRUE'
      ),
      pool.query(`
        SELECT COUNT(*) FROM controles_prenatales
        WHERE EXTRACT(MONTH FROM fecha) = EXTRACT(MONTH FROM CURRENT_DATE)
          AND EXTRACT(YEAR  FROM fecha) = EXTRACT(YEAR  FROM CURRENT_DATE)
      `),
      pool.query(`
        SELECT
          p.id,
          p.nombres || ' ' || p.apellidos AS nombre,
          p.no_expediente,
          c.cita_siguiente,
          c.numero_control
        FROM controles_prenatales c
        JOIN pacientes p ON p.id = c.paciente_id
        WHERE c.cita_siguiente BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
        ORDER BY c.cita_siguiente ASC
        LIMIT 15
      `),
    ]);

    return res.json({
      total_pacientes:      parseInt(totalPacientes.rows[0].count),
      pacientes_con_riesgo: parseInt(pacientesConRiesgo.rows[0].count),
      controles_este_mes:   parseInt(controlesEsteMes.rows[0].count),
      proximas_citas:       proximasCitas.rows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener estadisticas' });
  }
}

// ============================================================
// GET /api/reportes/pacientes-riesgo
// ============================================================
async function pacientesConRiesgo(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT
        p.id,
        p.nombres || ' ' || p.apellidos AS nombre,
        p.no_expediente,
        p.cui,
        DATE_PART('year', AGE(CURRENT_DATE, p.fecha_nacimiento))::INTEGER AS edad,
        p.fur,
        r.tiene_riesgo
      FROM pacientes p
      JOIN fichas_riesgo_obstetrico r ON r.paciente_id = p.id
      WHERE r.tiene_riesgo = TRUE
      ORDER BY p.apellidos ASC, p.nombres ASC
    `);
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener pacientes con riesgo' });
  }
}

module.exports = {
  censoMensual,
  exportarCensoExcel,
  estadisticas,
  pacientesConRiesgo,
};
