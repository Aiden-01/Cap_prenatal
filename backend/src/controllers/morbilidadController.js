const pool = require('../db/pool');
const { obtenerEmbarazoSeguimientoId } = require('../utils/embarazos');
const { withGuatemalaTimeFallback } = require('../utils/guatemalaTime');
const { registrarAuditoria } = require('../utils/auditoria');

const MORBILIDAD_FIELDS = [
  'fecha',
  'hora',
  'motivo_consulta',
  'historia_enfermedad_actual',
  'revision_por_sistemas',
  'examen_fisico',
  'impresion_clinica',
  'tratamiento_referencia',
  'nombre_cargo_atiende',
];

// ============================================================
// GET /api/pacientes/:pacienteId/morbilidad
// ============================================================
async function listar(req, res) {
  const { pacienteId } = req.params;
  try {
    const embarazoId = await obtenerEmbarazoSeguimientoId(pacienteId);
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
    const embarazoId = await obtenerEmbarazoSeguimientoId(pacienteId);
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
    const embarazoId = await obtenerEmbarazoSeguimientoId(pacienteId);
    if (!embarazoId) {
      return res.status(409).json({ error: 'No hay embarazo activo o en puerperio para guardar morbilidad' });
    }
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
    await registrarAuditoria(req, {
      accion: 'crear',
      tabla: 'morbilidad_embarazo',
      registroId: rows[0].id,
      pacienteId,
      embarazoId,
      datosNuevos: rows[0],
      descripcion: 'Registro de morbilidad creado',
    });
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

  const campos = MORBILIDAD_FIELDS
    .filter((campo) => Object.prototype.hasOwnProperty.call(d, campo));

  if (campos.length === 0) return res.status(400).json({ error: 'Sin campos para actualizar' });

  const sets = campos.map((c, i) => `${c} = $${i + 1}`).join(', ');
  try {
    const embarazoId = await obtenerEmbarazoSeguimientoId(pacienteId);
    const before = await pool.query(
      'SELECT * FROM morbilidad_embarazo WHERE id = $1 AND embarazo_id = $2',
      [id, embarazoId]
    );
    const valores = [...campos.map(c => d[c]), id, embarazoId];
    const { rows, rowCount } = await pool.query(
      `UPDATE morbilidad_embarazo SET ${sets}, updated_at = NOW()
       WHERE id = $${valores.length - 1} AND embarazo_id = $${valores.length}
       RETURNING *`,
      valores
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Registro no encontrado' });
    await registrarAuditoria(req, {
      accion: 'actualizar',
      tabla: 'morbilidad_embarazo',
      registroId: id,
      pacienteId,
      embarazoId,
      datosAnteriores: before.rows[0],
      datosNuevos: rows[0],
      descripcion: 'Registro de morbilidad actualizado',
    });
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
    const embarazoId = await obtenerEmbarazoSeguimientoId(pacienteId);
    const { rows, rowCount } = await pool.query(
      'DELETE FROM morbilidad_embarazo WHERE id = $1 AND embarazo_id = $2 RETURNING *',
      [id, embarazoId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Registro no encontrado' });
    await registrarAuditoria(req, {
      accion: 'eliminar',
      tabla: 'morbilidad_embarazo',
      registroId: id,
      pacienteId,
      embarazoId,
      datosAnteriores: rows[0],
      descripcion: 'Registro de morbilidad eliminado',
    });
    return res.json({ message: 'Registro eliminado' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al eliminar registro' });
  }
}

module.exports = { listar, obtener, guardar, actualizar, eliminar };
