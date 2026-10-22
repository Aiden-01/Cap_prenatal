const notas = require('./notasClinicasRepository');

async function listar({ pacienteId, embarazoId, ids, tipos }, db) {
  // Acotado a 100 IDs; una sola sentencia y ningún campo narrativo.
  const { rows } = await db.query(`SELECT c.id AS control_prenatal_id, s.version,
    CASE WHEN r.tipo IS NOT NULL OR n.id IS NOT NULL THEN t.tipo END AS tipo, r.responsable_snapshot AS responsable_previsto,
    n.id AS nota_id, n.estado AS estado_nota, n.version AS nota_version,
    n.responsable_snapshot AS responsable_nota
    FROM controles_prenatales c
    LEFT JOIN controles_seguimiento_notas s ON s.control_prenatal_id = c.id
    CROSS JOIN unnest($4::text[]) AS t(tipo)
    LEFT JOIN controles_notas_requeridas r ON r.control_prenatal_id = s.control_prenatal_id AND r.tipo = t.tipo
    LEFT JOIN notas_clinicas n ON n.control_prenatal_id = c.id AND n.es_principal
      AND n.tipo = t.tipo
    WHERE c.paciente_id = $1 AND c.embarazo_id = $2 AND c.id = ANY($3::integer[])
    ORDER BY c.id, r.tipo`, [pacienteId, embarazoId, ids, tipos]);
  return rows;
}

async function bloquear(controlId, db) {
  const { rows } = await db.query('SELECT * FROM controles_seguimiento_notas WHERE control_prenatal_id = $1 FOR UPDATE', [controlId]);
  return rows[0] || null;
}

async function obtenerRequerimiento(controlId, tipo, db) {
  const { rows } = await db.query('SELECT * FROM controles_notas_requeridas WHERE control_prenatal_id = $1 AND tipo = $2', [controlId, tipo]);
  return rows[0] || null;
}

async function agregar({ controlId, tipo, snapshot, actorId, version }, db) {
  await db.query(`INSERT INTO controles_notas_requeridas(control_prenatal_id,tipo,responsable_snapshot,confirmado_por)
    VALUES($1,$2,$3::jsonb,$4)`, [controlId, tipo, JSON.stringify(snapshot), actorId]);
  const { rows } = await db.query(`UPDATE controles_seguimiento_notas SET version = version + 1
    WHERE control_prenatal_id = $1 AND version = $2 RETURNING version`, [controlId, version]);
  return rows[0];
}

module.exports = { enTransaccion: notas.enTransaccion, listar, bloquear, obtenerRequerimiento, agregar };
