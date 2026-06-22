const pool = require('../db/pool');

async function listar({ q, limite, offset }) {
  const { rows } = await pool.query(
    `SELECT pacientes.id, no_expediente, cui,
            nombres, apellidos,
            fecha_nacimiento, pacientes.fur, pacientes.fpp,
            municipio, comunidad, telefono,
            pacientes.created_at,
            embarazo_actual.id AS embarazo_id,
            embarazo_actual.estado AS embarazo_estado,
            embarazo_actual.fur AS embarazo_fur,
            embarazo_actual.fpp AS embarazo_fpp,
            COALESCE(riesgo_actual.tiene_riesgo, pacientes.tiene_ficha_riesgo, FALSE) AS tiene_riesgo
     FROM pacientes
     LEFT JOIN LATERAL (
       SELECT id, estado, fur, fpp
       FROM embarazos
       WHERE paciente_id = pacientes.id
       ORDER BY
         CASE estado
           WHEN 'activo' THEN 1
           WHEN 'puerperio' THEN 2
           ELSE 3
         END,
         numero_embarazo DESC
       LIMIT 1
     ) embarazo_actual ON TRUE
     LEFT JOIN LATERAL (
       SELECT tiene_riesgo
       FROM fichas_riesgo_obstetrico
       WHERE embarazo_id = embarazo_actual.id
       ORDER BY fecha DESC LIMIT 1
     ) riesgo_actual ON TRUE
     WHERE nombres ILIKE $1
        OR apellidos ILIKE $1
        OR no_expediente ILIKE $1
        OR cui ILIKE $1
     ORDER BY nombres ASC, apellidos ASC
     LIMIT $2 OFFSET $3`,
    [q, limite, offset]
  );
  return rows;
}

async function contar({ q }) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) FROM pacientes
     WHERE nombres ILIKE $1 OR apellidos ILIKE $1
        OR no_expediente ILIKE $1 OR cui ILIKE $1`,
    [q]
  );
  return parseInt(rows[0].count, 10);
}

async function obtenerPorId(id) {
  const { rows } = await pool.query('SELECT * FROM pacientes WHERE id = $1', [id]);
  return rows[0] || null;
}

async function existeCui(cui, pacienteId = null) {
  if (!cui) return false;

  const params = [cui];
  let where = 'cui = $1';
  if (pacienteId) {
    params.push(pacienteId);
    where += ` AND id <> $${params.length}`;
  }

  const { rowCount } = await pool.query(
    `SELECT 1 FROM pacientes WHERE ${where} LIMIT 1`,
    params
  );
  return rowCount > 0;
}

async function insertarPaciente(data) {
  const campos = Object.keys(data);
  const placeholders = campos.map((_, i) => `$${i + 1}`).join(', ');
  const valores = campos.map((campo) => data[campo]);
  const { rows } = await pool.query(
    `INSERT INTO pacientes (${campos.join(', ')})
     VALUES (${placeholders})
     RETURNING *`,
    valores
  );
  return rows[0];
}

async function actualizarPaciente(id, data, campos, updatedBy = null) {
  const sets = campos.map((c, i) => `${c} = $${i + 1}`).join(', ');
  const valores = campos.map((campo) => data[campo]);
  valores.push(updatedBy, id);

  const { rows, rowCount } = await pool.query(
    `UPDATE pacientes SET ${sets}, updated_at = NOW(), updated_by = $${valores.length - 1}
     WHERE id = $${valores.length}
     RETURNING *`,
    valores
  );
  return { paciente: rows[0] || null, rowCount };
}

async function crearEmbarazoInicial({ pacienteId, fur, fpp, usuarioId }) {
  const { rows } = await pool.query(
    `INSERT INTO embarazos (paciente_id, numero_embarazo, estado, fur, fpp, fecha_inicio, registrado_por)
     VALUES ($1, 1, 'activo', $2, $3, COALESCE($2, CURRENT_DATE), $4)
     RETURNING *`,
    [pacienteId, fur, fpp, usuarioId]
  );
  return rows[0] || null;
}

async function existeEmbarazoActivo(pacienteId, embarazoIdExcluir = null) {
  const params = [pacienteId];
  let where = "paciente_id = $1 AND estado = 'activo'";
  if (embarazoIdExcluir) {
    params.push(embarazoIdExcluir);
    where += ` AND id <> $${params.length}`;
  }

  const { rowCount } = await pool.query(
    `SELECT 1 FROM embarazos WHERE ${where} LIMIT 1`,
    params
  );
  return rowCount > 0;
}

async function obtenerEmbarazoActivoId(pacienteId) {
  const { rows } = await pool.query(
    `SELECT id
     FROM embarazos
     WHERE paciente_id = $1 AND estado = 'activo'
     ORDER BY numero_embarazo DESC
     LIMIT 1`,
    [pacienteId]
  );
  return rows[0]?.id || null;
}

async function obtenerEmbarazoPorId(id) {
  const { rows } = await pool.query('SELECT * FROM embarazos WHERE id = $1', [id]);
  return rows[0] || null;
}

async function obtenerEmbarazoVisibleId(pacienteId) {
  const { rows } = await pool.query(
    `SELECT id
     FROM embarazos
     WHERE paciente_id = $1
     ORDER BY
       CASE estado
         WHEN 'activo' THEN 1
         WHEN 'puerperio' THEN 2
         ELSE 3
       END,
       numero_embarazo DESC
     LIMIT 1`,
    [pacienteId]
  );
  return rows[0]?.id || null;
}

async function crearEmbarazoDesdePaciente(pacienteId) {
  const { rows } = await pool.query(
    `INSERT INTO embarazos (paciente_id, numero_embarazo, estado, fur, fpp, fecha_inicio)
     SELECT id, 1, 'activo', fur, fpp, COALESCE(fur, CURRENT_DATE)
     FROM pacientes
     WHERE id = $1
     RETURNING id`,
    [pacienteId]
  );
  return rows[0]?.id || null;
}

async function obtenerExpedienteCompleto(pacienteId, embarazoId) {
  const [
    paciente,
    embarazos,
    embarazoActivo,
    controles,
    puerperio,
    morbilidad,
    riesgo,
    planParto,
    vacunas,
    referencias,
  ] = await Promise.all([
    pool.query('SELECT * FROM pacientes WHERE id = $1', [pacienteId]),
    pool.query('SELECT * FROM embarazos WHERE paciente_id = $1 ORDER BY numero_embarazo DESC', [pacienteId]),
    pool.query('SELECT * FROM embarazos WHERE id = $1', [embarazoId]),
    pool.query('SELECT * FROM controles_prenatales WHERE embarazo_id = $1 ORDER BY numero_control', [embarazoId]),
    pool.query('SELECT * FROM controles_puerperio WHERE embarazo_id = $1 ORDER BY numero_atencion', [embarazoId]),
    pool.query('SELECT * FROM morbilidad_embarazo WHERE embarazo_id = $1 ORDER BY fecha DESC', [embarazoId]),
    pool.query('SELECT * FROM fichas_riesgo_obstetrico WHERE embarazo_id = $1 ORDER BY fecha DESC LIMIT 1', [embarazoId]),
    pool.query('SELECT * FROM planes_parto WHERE embarazo_id = $1 ORDER BY fecha DESC LIMIT 1', [embarazoId]),
    pool.query('SELECT * FROM vacunas_paciente WHERE embarazo_id = $1 ORDER BY tipo_vacuna, numero_dosis', [embarazoId]),
    pool.query('SELECT * FROM referencias_efectuadas WHERE paciente_id = $1 ORDER BY fecha DESC', [pacienteId]),
  ]);

  return {
    paciente: paciente.rows[0] || null,
    embarazos: embarazos.rows,
    embarazo_activo: embarazoActivo.rows[0] || null,
    controles_prenatales: controles.rows,
    controles_puerperio: puerperio.rows,
    morbilidad: morbilidad.rows,
    ficha_riesgo: riesgo.rows[0] || null,
    plan_parto: planParto.rows[0] || null,
    vacunas: vacunas.rows,
    referencias: referencias.rows,
  };
}

async function obtenerCompletitudExpediente(pacienteId) {
  const { rows } = await pool.query(
    `SELECT
       e.id AS embarazo_id,
       EXISTS(SELECT 1 FROM fichas_riesgo_obstetrico r WHERE r.embarazo_id = e.id)
         AS tiene_ficha_riesgo,
       ((SELECT COUNT(*) FROM controles_prenatales cp WHERE cp.embarazo_id = e.id) >= 4)
         AS tiene_controles,
       (SELECT COUNT(*) FROM controles_prenatales cp WHERE cp.embarazo_id = e.id)
         AS total_controles,
       EXISTS(SELECT 1 FROM vacunas_paciente v WHERE v.embarazo_id = e.id)
         AS tiene_vacunas,
       EXISTS(SELECT 1 FROM planes_parto pp WHERE pp.embarazo_id = e.id)
         AS tiene_plan_parto,
       EXISTS(SELECT 1 FROM morbilidad_embarazo m WHERE m.embarazo_id = e.id)
         AS tiene_morbilidad
     FROM embarazos e
     WHERE e.paciente_id = $1 AND e.estado = 'activo'
     ORDER BY e.numero_embarazo DESC
     LIMIT 1`,
    [pacienteId]
  );

  return rows[0] || null;
}

async function cerrarEmbarazosEnSeguimiento(pacienteId, fechaCierre, updatedBy = null) {
  const { rows } = await pool.query(
    `UPDATE embarazos
     SET estado = 'cerrado', fecha_cierre = COALESCE($2, CURRENT_DATE),
         updated_at = NOW(), updated_by = $3
     WHERE paciente_id = $1 AND estado IN ('activo', 'puerperio')
     RETURNING *`,
    [pacienteId, fechaCierre, updatedBy]
  );
  return rows;
}

async function obtenerEmbarazoActual(pacienteId) {
  const { rows } = await pool.query(
    `SELECT * FROM embarazos
     WHERE paciente_id = $1 AND estado = 'activo'
     ORDER BY numero_embarazo DESC LIMIT 1`,
    [pacienteId]
  );
  return rows[0] || null;
}

async function obtenerSiguienteNumeroEmbarazo(pacienteId) {
  const { rows } = await pool.query(
    'SELECT COALESCE(MAX(numero_embarazo), 0) + 1 AS siguiente FROM embarazos WHERE paciente_id = $1',
    [pacienteId]
  );
  return rows[0].siguiente;
}

async function insertarNuevoEmbarazo({ pacienteId, numeroEmbarazo, fur, fpp, observaciones, usuarioId }) {
  const { rows } = await pool.query(
    `INSERT INTO embarazos (paciente_id, numero_embarazo, estado, fur, fpp, fecha_inicio, observaciones, registrado_por)
     VALUES ($1, $2, 'activo', $3, $4, COALESCE($3, CURRENT_DATE), $5, $6)
     RETURNING *`,
    [pacienteId, numeroEmbarazo, fur, fpp, observaciones, usuarioId]
  );
  return rows[0];
}

async function sincronizarPacienteConEmbarazo({ pacienteId, fur, fpp, updatedBy = null }) {
  const { rows } = await pool.query(
    `UPDATE pacientes
     SET fur = $2, fpp = $3, tiene_ficha_riesgo = FALSE,
         updated_at = NOW(), updated_by = $4
     WHERE id = $1
     RETURNING *`,
    [pacienteId, fur, fpp, updatedBy]
  );
  return rows[0] || null;
}

async function obtenerUltimoEmbarazoActivo(pacienteId) {
  const { rows } = await pool.query(
    `SELECT * FROM embarazos
     WHERE paciente_id = $1 AND estado = 'activo'
     ORDER BY id DESC LIMIT 1`,
    [pacienteId]
  );
  return rows[0] || null;
}

async function pasarEmbarazoAPuerperio({ pacienteId, embarazoId, fechaCierre, observaciones, updatedBy = null }) {
  const { rows } = await pool.query(
    `UPDATE embarazos
     SET estado = 'puerperio',
         fecha_cierre = COALESCE($2, fecha_cierre, CURRENT_DATE),
         observaciones = COALESCE($3, observaciones),
         updated_at = NOW(),
         updated_by = $4
     WHERE paciente_id = $1 AND id = $5 AND estado = 'activo'
     RETURNING *`,
    [pacienteId, fechaCierre, observaciones, updatedBy, embarazoId]
  );
  return rows[0] || null;
}

async function obtenerUltimoEmbarazoEnSeguimiento(pacienteId) {
  const { rows } = await pool.query(
    `SELECT * FROM embarazos
     WHERE paciente_id = $1 AND estado IN ('activo', 'puerperio')
     ORDER BY id DESC LIMIT 1`,
    [pacienteId]
  );
  return rows[0] || null;
}

async function cerrarEmbarazoEnSeguimiento({ pacienteId, embarazoId, fechaCierre, observaciones, updatedBy = null }) {
  const { rows } = await pool.query(
    `UPDATE embarazos
     SET estado = 'cerrado',
         fecha_cierre = COALESCE($2, fecha_cierre, CURRENT_DATE),
         observaciones = COALESCE($3, observaciones),
         updated_at = NOW(),
         updated_by = $4
     WHERE paciente_id = $1 AND id = $5 AND estado IN ('activo', 'puerperio')
     RETURNING *`,
    [pacienteId, fechaCierre, observaciones, updatedBy, embarazoId]
  );
  return rows[0] || null;
}

async function actualizarEmbarazoFechas({ embarazoId, fur, fpp, updatedBy = null }) {
  const { rows } = await pool.query(
    `UPDATE embarazos
     SET fur = COALESCE($2, fur), fpp = COALESCE($3, fpp),
         updated_at = NOW(), updated_by = $4
     WHERE id = $1
     RETURNING *`,
    [embarazoId, fur, fpp, updatedBy]
  );
  return rows[0] || null;
}

module.exports = {
  listar,
  contar,
  obtenerPorId,
  existeCui,
  insertarPaciente,
  actualizarPaciente,
  crearEmbarazoInicial,
  existeEmbarazoActivo,
  obtenerEmbarazoActivoId,
  obtenerEmbarazoPorId,
  obtenerEmbarazoActual,
  obtenerEmbarazoVisibleId,
  crearEmbarazoDesdePaciente,
  obtenerExpedienteCompleto,
  obtenerCompletitudExpediente,
  cerrarEmbarazosEnSeguimiento,
  obtenerSiguienteNumeroEmbarazo,
  insertarNuevoEmbarazo,
  sincronizarPacienteConEmbarazo,
  obtenerUltimoEmbarazoActivo,
  pasarEmbarazoAPuerperio,
  obtenerUltimoEmbarazoEnSeguimiento,
  cerrarEmbarazoEnSeguimiento,
  actualizarEmbarazoFechas,
};
