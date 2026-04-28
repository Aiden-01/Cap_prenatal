const pool = require('../db/pool');

// ============================================================
// GET /api/pacientes/:pacienteId/vacunas
// ============================================================
async function listar(req, res) {
  const { pacienteId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM vacunas_paciente
       WHERE paciente_id = $1
       ORDER BY tipo_vacuna, momento, numero_dosis`,
      [pacienteId]
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al listar vacunas' });
  }
}

// ============================================================
// POST /api/pacientes/:pacienteId/vacunas
// Upsert por (paciente_id, tipo_vacuna, momento, numero_dosis)
// ============================================================
async function guardar(req, res) {
  const { pacienteId } = req.params;
  const d = req.body;

  if (!d.tipo_vacuna || !d.momento) {
    return res.status(400).json({
      error: 'tipo_vacuna y momento son requeridos'
    });
  }

  // Validar enums del schema
  const tiposValidos  = ['td_tdap', 'influenza', 'spr_sr'];
  const momentosValidos = ['previo_embarazo', 'durante_embarazo', 'postparto_aborto'];

  if (!tiposValidos.includes(d.tipo_vacuna)) {
    return res.status(400).json({ error: `tipo_vacuna debe ser: ${tiposValidos.join(', ')}` });
  }
  if (!momentosValidos.includes(d.momento)) {
    return res.status(400).json({ error: `momento debe ser: ${momentosValidos.join(', ')}` });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO vacunas_paciente (
        paciente_id,
        tipo_vacuna,
        momento,
        numero_dosis,
        fecha_dosis,
        registrado_por
      ) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (paciente_id, tipo_vacuna, momento, numero_dosis)
      DO UPDATE SET
        fecha_dosis    = EXCLUDED.fecha_dosis,
        registrado_por = EXCLUDED.registrado_por
      RETURNING *`,
      [
        pacienteId,
        d.tipo_vacuna,
        d.momento,
        d.numero_dosis ?? 1,
        d.fecha_dosis || null,
        req.usuario.id
      ]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al guardar vacuna' });
  }
}

// ============================================================
// DELETE /api/pacientes/:pacienteId/vacunas/:id
// ============================================================
async function eliminar(req, res) {
  const { id } = req.params;
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM vacunas_paciente WHERE id = $1',
      [id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Vacuna no encontrada' });
    return res.json({ message: 'Vacuna eliminada' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al eliminar vacuna' });
  }
}

module.exports = { listar, guardar, eliminar };