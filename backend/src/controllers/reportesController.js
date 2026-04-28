const pool = require('../db/pool');
const ExcelJS = require('exceljs');

// ============================================================
// GET /api/reportes/censo?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// ============================================================
async function censoMensual(req, res) {
  const { desde, hasta } = req.query;

  if (!desde || !hasta) {
    return res.status(400).json({
      error: 'Parámetros desde y hasta son requeridos (YYYY-MM-DD)'
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
    return res.status(400).json({ error: 'Parámetros requeridos' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT
        p.no_expediente,
        p.cui,
        p.nombres || ' ' || p.apellidos  AS nombre,
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
    const sheet = workbook.addWorksheet('Censo');

    sheet.columns = [
      { header: 'No. Expediente', key: 'exp',      width: 18 },
      { header: 'CUI',            key: 'cui',      width: 16 },
      { header: 'Nombre',         key: 'nombre',   width: 32 },
      { header: 'Edad',           key: 'edad',     width: 8  },
      { header: 'Etnia',          key: 'etnia',    width: 14 },
      { header: 'Municipio',      key: 'municipio',width: 18 },
      { header: 'FUR',            key: 'fur',      width: 14 },
      { header: 'FPP',            key: 'fpp',      width: 14 },
      { header: 'Semanas',        key: 'sem',      width: 10 },
      { header: 'Gestas',         key: 'gestas',   width: 9  },
      { header: 'Partos',         key: 'partos',   width: 9  },
      { header: 'Abortos',        key: 'abortos',  width: 9  },
      { header: 'Riesgo',         key: 'riesgo',   width: 10 },
    ];

    sheet.getRow(1).font = { bold: true };

    rows.forEach(p => {
      sheet.addRow({
        exp:      p.no_expediente,
        cui:      p.cui || '—',
        nombre:   p.nombre,
        edad:     p.edad,
        etnia:    p.etnia || '—',
        municipio:p.municipio || '—',
        fur:      p.fur,
        fpp:      p.fpp,
        sem:      p.semanas,
        gestas:   p.gestas_previas,
        partos:   p.partos,
        abortos:  p.abortos,
        riesgo:   p.riesgo ? 'Sí' : 'No',
      });
    });

    // Semáforo columna riesgo
    sheet.getColumn('riesgo').eachCell((cell, rowNum) => {
      if (rowNum === 1) return;
      cell.fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: cell.value === 'Sí' ? 'FFFFC7CE' : 'FFC6EFCE' }
      };
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
    return res.status(500).json({ error: 'Error al obtener estadísticas' });
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