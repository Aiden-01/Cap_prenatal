const pool = require("../db/pool");
const ExcelJS = require("exceljs");

// ===============================
// 📊 CENSO (RANGO DE FECHAS)
// ===============================
async function censoMensual(req, res) {
  const { desde, hasta } = req.query;

  if (!desde || !hasta) {
    return res.status(400).json({
      error: "Parámetros desde y hasta son requeridos (YYYY-MM-DD)",
    });
  }

  try {
    const { rows } = await pool.query(
      `SELECT
        p.id,
        p.no_historia_clinica,
        p.nombre,
        p.edad,
        p.grupo_etnico,
        p.lugar_residencia,
        p.fur,
        p.no_embarazos,
        (p.no_partos_eutocicos + p.no_partos_distocicos) AS no_partos,
        p.no_cesarea,
        p.no_abortos,
        (p.no_embarazos - p.muerte_fetal_neonatal) AS hijos_vivos,
        p.muerte_fetal_neonatal AS hijos_muertos,
        p.fur + INTERVAL '280 days' AS fecha_probable_parto,
        EXTRACT(WEEK FROM AGE(CURRENT_DATE, p.fur))::INTEGER AS semanas_gestacion,
        COALESCE(r.tiene_riesgo, FALSE) AS tiene_riesgo,
        p.created_at
      FROM pacientes p
      LEFT JOIN fichas_riesgo_obstetrico r ON r.paciente_id = p.id
      WHERE DATE(p.created_at) BETWEEN $1 AND $2
      ORDER BY p.nombre ASC`,
      [desde, hasta]
    );

    return res.json({
      desde,
      hasta,
      total: rows.length,
      pacientes: rows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error al generar censo" });
  }
}

// ===============================
// 📥 EXPORTAR EXCEL
// ===============================
async function exportarCensoExcel(req, res) {
  const { desde, hasta } = req.query;

  if (!desde || !hasta) {
    return res.status(400).json({ error: "Parámetros requeridos" });
  }

  try {
    const { rows } = await pool.query(
      `SELECT
        p.no_historia_clinica,
        p.nombre,
        p.edad,
        p.grupo_etnico,
        p.fur,
        (p.no_partos_eutocicos + p.no_partos_distocicos) AS partos,
        p.no_abortos,
        p.no_embarazos,
        p.fur + INTERVAL '280 days' AS fpp,
        EXTRACT(WEEK FROM AGE(CURRENT_DATE, p.fur))::INTEGER AS semanas,
        COALESCE(r.tiene_riesgo, FALSE) AS riesgo
      FROM pacientes p
      LEFT JOIN fichas_riesgo_obstetrico r ON r.paciente_id = p.id
      WHERE DATE(p.created_at) BETWEEN $1 AND $2
      ORDER BY p.nombre ASC`,
      [desde, hasta]
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Censo");

    sheet.columns = [
      { header: "Historia Clínica", key: "hc", width: 20 },
      { header: "Nombre", key: "nombre", width: 30 },
      { header: "Edad", key: "edad", width: 10 },
      { header: "Etnia", key: "etnia", width: 20 },
      { header: "FUR", key: "fur", width: 15 },
      { header: "FPP", key: "fpp", width: 15 },
      { header: "Semanas", key: "sem", width: 10 },
      { header: "Embarazos", key: "emb", width: 12 },
      { header: "Partos", key: "partos", width: 10 },
      { header: "Abortos", key: "abortos", width: 10 },
      { header: "Riesgo", key: "riesgo", width: 10 },
    ];

    // Header estilo
    sheet.getRow(1).font = { bold: true };

    rows.forEach((p) => {
      sheet.addRow({
        hc: p.no_historia_clinica,
        nombre: p.nombre,
        edad: p.edad,
        etnia: p.grupo_etnico || "—",
        fur: p.fur,
        fpp: p.fpp,
        sem: p.semanas,
        emb: p.no_embarazos,
        partos: p.partos,
        abortos: p.no_abortos,
        riesgo: p.riesgo ? "Sí" : "No",
      });
    });

    // 🎨 COLORES TIPO SEMÁFORO
    sheet.getColumn("riesgo").eachCell((cell, rowNumber) => {
      if (rowNumber === 1) return;

      if (cell.value === "Sí") {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFC7CE" }, // rojo
        };
      } else {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFC6EFCE" }, // verde
        };
      }
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=censo_${desde}_${hasta}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error exportando Excel" });
  }
}

// ===============================
// 📊 ESTADÍSTICAS
// ===============================
async function estadisticas(req, res) {
  try {
    const [
      totalPacientes,
      pacientesConRiesgo,
      controlesEsteMes,
      proximasCitas,
    ] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM pacientes"),
      pool.query(
        "SELECT COUNT(*) FROM fichas_riesgo_obstetrico WHERE tiene_riesgo = TRUE"
      ),
      pool.query(`
        SELECT COUNT(*) FROM controles_prenatales
        WHERE EXTRACT(MONTH FROM fecha) = EXTRACT(MONTH FROM CURRENT_DATE)
          AND EXTRACT(YEAR FROM fecha) = EXTRACT(YEAR FROM CURRENT_DATE)
      `),
      pool.query(`
        SELECT p.id, p.nombre, p.no_historia_clinica, c.cita_siguiente, c.numero_control
        FROM controles_prenatales c
        JOIN pacientes p ON p.id = c.paciente_id
        WHERE c.cita_siguiente BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
        ORDER BY c.cita_siguiente ASC
        LIMIT 15
      `),
    ]);

    return res.json({
      total_pacientes: parseInt(totalPacientes.rows[0].count),
      pacientes_con_riesgo: parseInt(pacientesConRiesgo.rows[0].count),
      controles_este_mes: parseInt(controlesEsteMes.rows[0].count),
      proximas_citas: proximasCitas.rows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error al obtener estadísticas" });
  }
}

// ===============================
// ⚠️ PACIENTES CON RIESGO
// ===============================
async function pacientesConRiesgo(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT
        p.id,
        p.nombre,
        p.no_historia_clinica,
        p.edad,
        p.fur,
        r.tiene_riesgo
      FROM pacientes p
      JOIN fichas_riesgo_obstetrico r ON r.paciente_id = p.id
      WHERE r.tiene_riesgo = TRUE
      ORDER BY p.nombre ASC
    `);

    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Error al obtener pacientes con riesgo",
    });
  }
}

// ===============================
// EXPORTS
// ===============================
module.exports = {
  censoMensual,
  exportarCensoExcel,
  estadisticas,
  pacientesConRiesgo,
};