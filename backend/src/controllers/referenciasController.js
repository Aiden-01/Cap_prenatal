const pool = require('../db/pool');

const REFERENCIA_FIELDS = [
  'fecha',
  'lugar_referencia',
  'diagnostico',
];

// ============================================================
// GET /api/pacientes/:pacienteId/referencias
// ============================================================
async function listar(req, res) {
  const { pacienteId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM referencias_efectuadas
       WHERE paciente_id = $1
       ORDER BY fecha DESC`,
      [pacienteId]
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al listar referencias' });
  }
}

// ============================================================
// POST /api/pacientes/:pacienteId/referencias
// ============================================================
async function guardar(req, res) {
  const { pacienteId } = req.params;
  const d = req.body;

  if (!d.fecha || !d.lugar_referencia) {
    return res.status(400).json({ error: 'fecha y lugar_referencia son requeridos' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO referencias_efectuadas (
        paciente_id, fecha, lugar_referencia, diagnostico, registrado_por
      ) VALUES ($1,$2,$3,$4,$5)
      RETURNING *`,
      [
        pacienteId,
        d.fecha,
        d.lugar_referencia,
        d.diagnostico || null,
        req.usuario.id
      ]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al guardar referencia' });
  }
}

// ============================================================
// PUT /api/pacientes/:pacienteId/referencias/:id
// ============================================================
async function actualizar(req, res) {
  const { pacienteId, id } = req.params;
  const d = req.body;

  const campos = REFERENCIA_FIELDS
    .filter((campo) => Object.prototype.hasOwnProperty.call(d, campo));

  if (campos.length === 0) return res.status(400).json({ error: 'Sin campos para actualizar' });

  const sets = campos.map((c, i) => `${c} = $${i + 1}`).join(', ');
  const valores = [...campos.map(c => d[c]), id, pacienteId];

  try {
    const { rowCount } = await pool.query(
      `UPDATE referencias_efectuadas SET ${sets}, updated_at = NOW()
       WHERE id = $${valores.length - 1} AND paciente_id = $${valores.length}`,
      valores
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Referencia no encontrada' });
    return res.json({ message: 'Referencia actualizada' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al actualizar referencia' });
  }
}

// ============================================================
// DELETE /api/pacientes/:pacienteId/referencias/:id
// ============================================================
async function eliminar(req, res) {
  const { pacienteId, id } = req.params;
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM referencias_efectuadas WHERE id = $1 AND paciente_id = $2',
      [id, pacienteId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Referencia no encontrada' });
    return res.json({ message: 'Referencia eliminada' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al eliminar referencia' });
  }
}

module.exports = { listar, guardar, actualizar, eliminar };
