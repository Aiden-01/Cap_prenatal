import { getErrorMessage } from './errorMessage.js';

export function inicioCapturaGuatemala(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(part => [part.type, part.value]));
  return { fecha: `${parts.year}-${parts.month}-${parts.day}`, hora: `${parts.hour}:${parts.minute}` };
}

export function errorNota(err, fallback = 'No se pudo completar la operación.') {
  const status = err?.response?.status;
  const code = err?.response?.data?.code;
  if (status === 404 && code === 'PACIENTE_NO_ENCONTRADA') return 'No se encontró la paciente en este entorno. Verifica el expediente seleccionado.';
  if (status === 404 && code === 'NOTA_NO_ENCONTRADA') return 'No se encontró esta nota para la paciente. Actualiza el historial antes de continuar.';
  const messages = {
    401: 'Tu sesión no está disponible o expiró. Inicia sesión de nuevo; conserva el texto antes de salir.',
    403: 'No tienes permiso para esta acción o el perfil responsable no corresponde al tipo de nota.',
    404: 'No se encontró la paciente o la nota, o el servidor no tiene disponible esta ruta. Actualiza el historial y verifica el backend.',
    409: 'La nota cambió o ya existe una principal. Conserva el texto y recupera la versión guardada.',
    400: 'Revisa los datos de la atención y del profesional responsable.',
    422: 'Revisa los datos de la atención y del profesional responsable.',
  };
  const detail = err?.response?.data?.message || err?.response?.data?.error;
  return messages[status] ? `${messages[status]}${typeof detail === 'string' ? ` ${detail}` : ''}`
    : status >= 500 ? 'El servidor no pudo completar la operación. Conserva el texto y vuelve a intentarlo.'
      : getErrorMessage(err, `${fallback} Verifica la conexión y vuelve a intentarlo.`);
}

export function validarNota({ fecha, hora, contenido, responsable, requiereResponsable }) {
  if (!fecha || !hora) return 'Completa la fecha y la hora de atención.';
  if (fecha > inicioCapturaGuatemala().fecha) return 'La fecha de atención no puede ser futura.';
  if (contenido.length > 20000) return 'La narrativa admite hasta 20000 caracteres.';
  if (!requiereResponsable) return '';
  if (!responsable?.tipo) return 'Selecciona al profesional responsable de la atención.';
  if (responsable.tipo === 'usuario' && !responsable.usuario_id) return 'Selecciona un profesional habilitado del directorio.';
  if (responsable.tipo === 'externo' && (!responsable.nombre_completo?.trim() || !responsable.cargo_codigo)) {
    return 'Completa nombre, cargo y cargo del profesional externo.';
  }
  return '';
}
