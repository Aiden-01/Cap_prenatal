const pool = require('../db/pool');
const { obtenerEmbarazoActivoId } = require('../utils/embarazos');
const { withGuatemalaTimeFallback } = require('../utils/guatemalaTime');

// ============================================================
// GET /api/pacientes/:pacienteId/morbilidad
// ============================================================
async function listar(req, res) {
  const { pacienteId } = req.params;
  try {
    const embarazoId = await obtenerEmbarazoActivoId(pacienteId);
    const { rows } = await pool.query(
      `SELECT * FROM morbilidad_embarazo
       WHERE embarazo_id = $1
       ORDER BY fecha DESC`,
      [embarazoId]
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al listar morbilidad' });
  }
}

// ============================================================
// GET /api/pacientes/:pacienteId/morbilidad/:id
// ============================================================
async function obtener(req, res) {
  const { pacienteId, id } = req.params;
  try {
    const embarazoId = await obtenerEmbarazoActivoId(pacienteId);
    const { rows } = await pool.query(
      'SELECT * FROM morbilidad_embarazo WHERE id = $1 AND embarazo_id = $2',
      [id, embarazoId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Registro no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({ error: 'Error al obtener registro' });
  }
}

// ============================================================
// POST /api/pacientes/:pacienteId/morbilidad
// Siempre inserta un registro nuevo (N consultas por paciente)
// ============================================================
async function guardar(req, res) {
  const { pacienteId } = req.params;
  const d = withGuatemalaTimeFallback(req.body, { onlyWhenHoraIsPresent: true });

  if (!d.fecha || !d.motivo_consulta) {
    return res.status(400).json({ error: 'fecha y motivo_consulta son requeridos' });
  }

  try {
    const embarazoId = await obtenerEmbarazoActivoId(pacienteId);
    const { rows } = await pool.query(
      `INSERT INTO morbilidad_embarazo (
        paciente_id,
        embarazo_id,
        fecha,
        hora,
        motivo_consulta,
        historia_enfermedad_actual,
        revision_por_sistemas,
        examen_fisico,
        impresion_clinica,
        tratamiento_referencia,
        nombre_cargo_atiende,
        registrado_por
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *`,
      [
        pacienteId,
        embarazoId,
        d.fecha,
        d.hora || null,
        d.motivo_consulta,
        d.historia_enfermedad_actual || null,
        d.revision_por_sistemas || null,
        d.examen_fisico || null,
        d.impresion_clinica || null,
        d.tratamiento_referencia || null,
        d.nombre_cargo_atiende || null,
        req.usuario.id
      ]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al guardar morbilidad' });
  }
}

// ============================================================
// PUT /api/pacientes/:pacienteId/morbilidad/:id
// ============================================================
async function actualizar(req, res) {
  const { pacienteId, id } = req.params;
  const d = withGuatemalaTimeFallback(req.body);

  const BLOQUEADOS = ['id', 'paciente_id', 'embarazo_id', 'registrado_por', 'created_at'];
  const campos = Object.keys(d).filter(k => !BLOQUEADOS.includes(k));

  if (campos.length === 0) return res.status(400).json({ error: 'Sin campos para actualizar' });

  const sets = campos.map((c, i) => `${c} = $${i + 1}`).join(', ');
  const embarazoId = await obtenerEmbarazoActivoId(pacienteId);
  const valores = [...campos.map(c => d[c]), id, embarazoId];

  try {
    const { rowCount } = await pool.query(
      `UPDATE morbilidad_embarazo SET ${sets}, updated_at = NOW()
       WHERE id = $${valores.length - 1} AND embarazo_id = $${valores.length}`,
      valores
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Registro no encontrado' });
    return res.json({ message: 'Registro actualizado' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al actualizar registro' });
  }
}

// ============================================================
// DELETE /api/pacientes/:pacienteId/morbilidad/:id
// ============================================================
async function eliminar(req, res) {
  const { pacienteId, id } = req.params;
  try {
    const embarazoId = await obtenerEmbarazoActivoId(pacienteId);
    await pool.query('DELETE FROM morbilidad_embarazo WHERE id = $1 AND embarazo_id = $2', [id, embarazoId]);
    return res.json({ message: 'Registro eliminado' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al eliminar registro' });
  }
}

module.exports = { listar, obtener, guardar, actualizar, eliminar };
