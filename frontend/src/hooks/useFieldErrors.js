import { useMemo, useState } from "react";
import { getErrorMessage, getFieldErrors } from "../utils/errorMessage";

export function useFieldErrors(labels = {}, inferFieldErrors) {
  const [fieldErrors, setFieldErrors] = useState({});

  const clearFieldError = (field) => {
    setFieldErrors((errors) => {
      if (!errors[field]) return errors;
      const next = { ...errors };
      delete next[field];
      return next;
    });
  };

  const setFormValue = (setForm, field, value) => {
    setForm((form) => ({ ...form, [field]: value }));
    clearFieldError(field);
  };

  const setErrorsFromResponse = (err, fallback = "Error al guardar") => {
    const parsedErrors = getFieldErrors(err);
    const inferredErrors = inferFieldErrors ? inferFieldErrors(err) : {};
    const nextErrors = Object.keys(parsedErrors).length ? parsedErrors : inferredErrors;
    setFieldErrors(nextErrors);

    const firstField = Object.keys(nextErrors)[0];
    return {
      errors: nextErrors,
      firstField,
      message: firstField
        ? `${labels[firstField] || firstField}: ${nextErrors[firstField]}`
        : getErrorMessage(err, fallback),
    };
  };

  const summary = useMemo(
    () =>
      Object.entries(fieldErrors).map(([field, message]) => ({
        field,
        label: labels[field] || field,
        message,
      })),
    [fieldErrors, labels]
  );

  return {
    fieldErrors,
    fieldError: (field) => fieldErrors[field],
    inputClass: (field) => `input-field ${fieldErrors[field] ? "input-error" : ""}`,
    summary,
    clearFieldError,
    clearFieldErrors: () => setFieldErrors({}),
    setErrorsFromResponse,
    setFormValue,
  };
}
