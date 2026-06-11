/**
 * Extrae el mensaje de error de una respuesta Axios de forma segura.
 * El backend devuelve siempre { message: "..." }
 */
export function getErrorMessage(err, fallback = 'Ocurrió un error inesperado') {
  return (
    err?.response?.data?.message ||
    err?.response?.data?.error ||   // compatibilidad legacy
    err?.message ||
    fallback
  );
}
