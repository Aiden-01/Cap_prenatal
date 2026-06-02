const pool = require('../db/pool');
const { obtenerEmbarazoSeguimientoId } = require('../utils/embarazos');
const { registrarAuditoria } = require('../utils/auditoria');
const emptyToNull = (value) => (value === '' || value === undefined ? null : value);

// ============================================================
// GET /api/pacientes/:pacienteId/vacunas
// ============================================================
async function listar(req, res) {
  const { pacienteId } = req.params;
  try {
    const embarazoId = await obtenerEmbarazoSeguimientoId(pacienteId);
    const { rows } = await pool.query(
      `SELECT * FROM vacunas_paciente
       WHERE embarazo_id = $1
       ORDER BY tipo_vacuna, momento, numero_dosis`,
      [embarazoId]
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al listar vacunas' });
  }
}

// ============================================================
// GET /api/pacientes/:pacienteId/vacunas/:id
// ============================================================
async function obtener(req, res) {
  const { pacienteId, id } = req.params;
  try {
    const embarazoId = await obtenerEmbarazoSeguimientoId(pacienteId);
    const { rows } = await pool.query(
      'SELECT * FROM vacunas_paciente WHERE id = $1 AND embarazo_id = $2',
      [id, embarazoId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Vacuna no encontrada' });
    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener vacuna' });
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
    const embarazoId = await obtenerEmbarazoSeguimientoId(pacienteId);
    if (!embarazoId) {
      return res.status(409).json({ error: 'No hay embarazo activo o en puerperio para guardar vacunas' });
    }
    const before = await pool.query(
      `SELECT * FROM vacunas_paciente
       WHERE embarazo_id = $1 AND tipo_vacuna = $2 AND momento = $3 AND numero_dosis = $4`,
      [embarazoId, d.tipo_vacuna, d.momento, d.numero_dosis ?? 1]
    );
    const { rows } = await pool.query(
      `INSERT INTO vacunas_paciente (
        paciente_id,
        embarazo_id,
        tipo_vacuna,
        momento,
        numero_dosis,
        fecha_dosis,
        registrado_por
      ) VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (embarazo_id, tipo_vacuna, momento, numero_dosis)
      DO UPDATE SET
        fecha_dosis    = EXCLUDED.fecha_dosis,
        registrado_por = EXCLUDED.registrado_por
      RETURNING *`,
      [
        pacienteId,
        embarazoId,
        d.tipo_vacuna,
        d.momento,
        d.numero_dosis ?? 1,
        d.fecha_dosis || null,
        req.usuario.id
      ]
    );
    await registrarAuditoria(req, {
      accion: before.rows[0] ? 'actualizar' : 'crear',
      tabla: 'vacunas_paciente',
      registroId: rows[0].id,
      pacienteId,
      embarazoId,
      datosAnteriores: before.rows[0] || null,
      datosNuevos: rows[0],
      descripcion: before.rows[0] ? 'Vacuna actualizada por upsert' : 'Vacuna registrada',
    });
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al guardar vacuna' });
  }
}

// ============================================================
// PUT /api/pacientes/:pacienteId/vacunas/:id
// ============================================================
async function actualizar(req, res) {
  const { pacienteId, id } = req.params;
  const d = req.body;

  if (!d.tipo_vacuna || !d.momento) {
    return res.status(400).json({ error: 'tipo_vacuna y momento son requeridos' });
  }

  const tiposValidos = ['td_tdap', 'influenza', 'spr_sr'];
  const momentosValidos = ['previo_embarazo', 'durante_embarazo', 'postparto_aborto'];
  if (!tiposValidos.includes(d.tipo_vacuna)) {
    return res.status(400).json({ error: `tipo_vacuna debe ser: ${tiposValidos.join(', ')}` });
  }
  if (!momentosValidos.includes(d.momento)) {
    return res.status(400).json({ error: `momento debe ser: ${momentosValidos.join(', ')}` });
  }

  try {
    const embarazoId = await obtenerEmbarazoSeguimientoId(pacienteId);
    const before = await pool.query(
      'SELECT * FROM vacunas_paciente WHERE id = $1 AND embarazo_id = $2',
      [id, embarazoId]
    );
    const { rows } = await pool.query(
      `UPDATE vacunas_paciente SET
        tipo_vacuna=$1, momento=$2, numero_dosis=$3, fecha_dosis=$4, registrado_por=$5
       WHERE id=$6 AND embarazo_id=$7
       RETURNING *`,
      [
        d.tipo_vacuna,
        d.momento,
        emptyToNull(d.numero_dosis) ?? 1,
        emptyToNull(d.fecha_dosis),
        req.usuario.id,
        id,
        embarazoId,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Vacuna no encontrada' });
    await registrarAuditoria(req, {
      accion: 'actualizar',
      tabla: 'vacunas_paciente',
      registroId: rows[0].id,
      pacienteId,
      embarazoId,
      datosAnteriores: before.rows[0],
      datosNuevos: rows[0],
      descripcion: 'Vacuna actualizada',
    });
    return res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una vacuna con esos datos para esta paciente' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Error al actualizar vacuna' });
  }
}

// ============================================================
// DELETE /api/pacientes/:pacienteId/vacunas/:id
// ============================================================
async function eliminar(req, res) {
  const { id } = req.params;
  const { pacienteId } = req.params;
  try {
    const embarazoId = await obtenerEmbarazoSeguimientoId(pacienteId);
    const { rows, rowCount } = await pool.query(
      'DELETE FROM vacunas_paciente WHERE id = $1 AND embarazo_id = $2 RETURNING *',
      [id, embarazoId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Vacuna no encontrada' });
    await registrarAuditoria(req, {
      accion: 'eliminar',
      tabla: 'vacunas_paciente',
      registroId: id,
      pacienteId,
      embarazoId,
      datosAnteriores: rows[0],
      descripcion: 'Vacuna eliminada',
    });
    return res.json({ message: 'Vacuna eliminada' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al eliminar vacuna' });
  }
}

module.exports = { listar, obtener, guardar, actualizar, eliminar };
