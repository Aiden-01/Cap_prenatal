/**
 * Extrae el mensaje de error de una respuesta Axios de forma segura.
 * El backend devuelve siempre { message: "..." }.
 */
export function getErrorMessage(err, fallback = "Ocurrio un error inesperado") {
  return (
    err?.response?.data?.message ||
    err?.response?.data?.error || // compatibilidad legacy
    err?.message ||
    fallback
  );
}

export function getFieldErrorDetails(err) {
  const details = err?.response?.data?.details || err?.response?.data?.detalles || [];

  if (!Array.isArray(details)) return [];

  return details
    .map((detail) => ({
      field: detail?.campo || detail?.field || detail?.path || "",
      message: detail?.mensaje || detail?.message || "Dato invalido",
    }))
    .filter((detail) => detail.field && detail.message);
}

export function getFieldErrors(err) {
  return getFieldErrorDetails(err).reduce((errors, detail) => {
    if (!errors[detail.field]) errors[detail.field] = detail.message;
    return errors;
  }, {});
}
