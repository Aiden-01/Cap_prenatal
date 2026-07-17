const pool = require('../db/pool');

async function insertarEvento(evento, db = pool) {
  await db.query(
    `INSERT INTO auditoria_eventos (
      usuario_id, accion, modulo, entidad_afectada, id_entidad,
      tabla, registro_id, paciente_id, embarazo_id,
      datos_anteriores, datos_nuevos, ip, user_agent, descripcion
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      evento.usuarioId,
      evento.accion,
      evento.modulo,
      evento.entidadAfectada,
      evento.idEntidad ? String(evento.idEntidad) : null,
      evento.tabla,
      evento.registroId ? String(evento.registroId) : null,
      evento.pacienteId,
      evento.embarazoId,
      evento.datosAnteriores,
      evento.datosNuevos,
      evento.ip,
      evento.userAgent,
      evento.descripcion,
    ]
  );
}

module.exports = {
  insertarEvento,
};
