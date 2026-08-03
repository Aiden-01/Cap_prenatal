import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, ChevronLeft, Save } from "lucide-react";
import api from "../api/axios";
import {
  AppointmentCard,
  ClinicalStatus,
  DoseSelector,
  IntervalWarningCard,
  MomentSelector,
  VaccineHistory,
  VaccineSelector,
} from "../components/VaccineFlow";
import VaccineClinicalDialog from "../components/VaccineClinicalDialog";
import { useGlobalToast } from "../context/ToastContext";
import { useFieldErrors } from "../hooks/useFieldErrors";
import { calculateGestationalAge } from "../utils/gestationalAge";
import { getGuatemalaDateInputValue } from "../utils/guatemalaTime";
import {
  VACCINE_MOMENTS,
  VACCINE_TYPES,
  assessVaccineInterval,
  assessVaccineMoment,
  clinicalDateFromRecord,
  firstAvailablePosition,
  formatClinicalDateSpanish,
  getAppointmentRecommendation,
  getVaccineStatus,
  hasMissingPreviousPositions,
  vaccineDefinition,
  vaccineDoseLabel,
  vaccineLabel,
} from "../utils/vaccineSchedule";
import {
  clinicalAlertFromIntervalAssessment,
  createVaccineClinicalAlert,
  getVaccineErrorPresentation,
} from "../utils/vaccineError";
import {
  buildVaccineRequestData,
  firstMissingVaccineField,
  normalizeVaccineDate,
} from "../utils/vaccineFormState";

const INIT = Object.freeze({
  tipo_vacuna: "",
  momento: "",
  numero_dosis: null,
  fecha_dosis: "",
});

const FIELD_LABELS = Object.freeze({
  tipo_vacuna: "Tipo de vacuna",
  momento: "Momento de aplicación",
  numero_dosis: "Posición de dosis",
  fecha_dosis: "Fecha de aplicación",
  embarazo_id: "Embarazo relacionado",
});

function inferVacunaFieldErrors(error) {
  const presentation = getVaccineErrorPresentation(error);
  return presentation.field ? { [presentation.field]: presentation.message } : {};
}

function Field({ id, label, children, error, hint }) {
  return (
    <div className="form-group">
      <label className="input-label" htmlFor={id}>{label}</label>
      {children}
      {hint ? <div className="vaccine-field-hint">{hint}</div> : null}
      {error ? <div className="field-error-text">{error}</div> : null}
    </div>
  );
}

function focusVaccineField(field) {
  const selectors = {
    tipo_vacuna: '[aria-label="Tipo de vacuna"] button',
    numero_dosis: '[aria-label="Posición de dosis"] button',
    momento: '[aria-label="Momento de aplicación"] button',
    fecha_dosis: "#vaccine-application-date",
  };
  const target = document.querySelector(selectors[field] || `[name="${field}"]`);
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
  target?.focus();
}

export default function VacunaForm() {
  const { id, vacunaId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const embarazoId = searchParams.get("embarazo_id") || "";
  const expedientePath = `/pacientes/${id}?embarazo_id=${embarazoId}&tab=vacunas`;
  const toast = useGlobalToast();
  const [form, setForm] = useState(INIT);
  const [expediente, setExpediente] = useState(null);
  const [historialVacunas, setHistorialVacunas] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [clinicalAlert, setClinicalAlert] = useState(null);
  const submitButtonRef = useRef(null);
  const fieldErrors = useFieldErrors(FIELD_LABELS, inferVacunaFieldErrors);
  const editando = Boolean(vacunaId);
  const pregnancy = expediente?.embarazo_seleccionado || expediente?.embarazo_activo || null;
  const pregnancyState = String(pregnancy?.estado || "").toLowerCase();
  const readOnly = Boolean(expediente?.is_read_only || pregnancyState === "cerrado");
  const today = getGuatemalaDateInputValue();

  useEffect(() => {
    if (!embarazoId) {
      toast("Selecciona un embarazo antes de registrar vacunas", "error");
      navigate(`/pacientes/${id}?tab=vacunas`, { replace: true });
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    const vacunaRequest = editando
      ? api.get(`/pacientes/${id}/vacunas/${vacunaId}`, { params: { embarazo_id: embarazoId }, signal: controller.signal })
      : Promise.resolve({ data: null });
    Promise.all([
      vacunaRequest,
      api.get(`/pacientes/${id}/expediente`, { params: { embarazo_id: embarazoId }, signal: controller.signal }),
      api.get(`/pacientes/${id}/vacunas/antecedentes`, { signal: controller.signal }),
    ])
      .then(([{ data: vaccine }, { data: patientRecord }, { data: history }]) => {
        if (!active) return;
        setLoadError("");
        setExpediente(patientRecord);
        setHistorialVacunas(Array.isArray(history) ? history : []);
        if (editando && vaccine) {
          setForm({ ...INIT, ...vaccine, fecha_dosis: clinicalDateFromRecord(vaccine) });
        }
      })
      .catch((error) => {
        if (active && error?.code !== "ERR_CANCELED") {
          setLoadError("No fue posible cargar el contexto de vacunación.");
          toast("Error al cargar vacuna", "error");
        }
      })
      .finally(() => {
        if (active) setInitialLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [id, vacunaId, editando, embarazoId, navigate, toast]);

  const historyWithoutCurrent = useMemo(() => (
    editando
      ? historialVacunas.filter((record) => String(record.id) !== String(vacunaId))
      : historialVacunas
  ), [editando, historialVacunas, vacunaId]);

  const status = useMemo(() => getVaccineStatus(
    form.tipo_vacuna,
    historialVacunas,
    { pregnancyId: pregnancy?.id || embarazoId }
  ), [form.tipo_vacuna, historialVacunas, pregnancy?.id, embarazoId]);

  const selectableStatus = useMemo(() => getVaccineStatus(
    form.tipo_vacuna,
    historyWithoutCurrent,
    { pregnancyId: pregnancy?.id || embarazoId }
  ), [form.tipo_vacuna, historyWithoutCurrent, pregnancy?.id, embarazoId]);

  const selectedDefinition = vaccineDefinition(form.tipo_vacuna);
  const isInfluenza = form.tipo_vacuna === VACCINE_TYPES.INFLUENZA;
  const selectedDose = Number(form.numero_dosis || 0);
  const currentGestationalAge = calculateGestationalAge(pregnancy?.fur, today);
  const applicationGestationalAge = calculateGestationalAge(pregnancy?.fur, form.fecha_dosis);
  const momentAssessment = assessVaccineMoment(pregnancy, form.fecha_dosis, form.momento);
  const missingPreviousPositions = hasMissingPreviousPositions(selectableStatus, selectedDose);
  const relatedPriorTdapExists = form.tipo_vacuna === VACCINE_TYPES.TDAP
    && selectableStatus?.applications.some((record) => (
      String(record.embarazo_id) === String(pregnancy?.id || embarazoId)
      && record.momento === VACCINE_MOMENTS.BEFORE_PREGNANCY
    ));
  const currentTdapExists = form.tipo_vacuna === VACCINE_TYPES.TDAP
    && Boolean(selectableStatus?.schemeApplications.length);
  const duplicatePosition = [VACCINE_TYPES.TD, VACCINE_TYPES.SPR_SR].includes(form.tipo_vacuna)
    && selectableStatus?.registeredPositions.includes(selectedDose);
  const maximumSchemeReached = [VACCINE_TYPES.TD, VACCINE_TYPES.SPR_SR].includes(form.tipo_vacuna)
    && selectableStatus?.completed >= selectedDefinition?.maximum;
  const tdapDuplicate = form.tipo_vacuna === VACCINE_TYPES.TDAP && (
    form.momento === VACCINE_MOMENTS.BEFORE_PREGNANCY
      ? relatedPriorTdapExists
      : form.momento ? currentTdapExists : false
  );
  const unavailablePositions = new Set(
    [VACCINE_TYPES.TD, VACCINE_TYPES.SPR_SR].includes(form.tipo_vacuna)
      ? selectableStatus?.registeredPositions || []
      : tdapDuplicate ? [1] : []
  );
  const previewRecommendation = getAppointmentRecommendation(
    form.tipo_vacuna,
    selectedDose,
    form.fecha_dosis,
    { existingPositions: selectableStatus?.registeredPositions || [] }
  );
  const intervalAssessment = assessVaccineInterval(
    form.tipo_vacuna,
    selectedDose,
    form.fecha_dosis,
    historyWithoutCurrent
  );
  const intervalAlert = clinicalAlertFromIntervalAssessment(intervalAssessment);

  let preflightClinicalAlert = null;
  if (maximumSchemeReached) {
    const reason = `El esquema de ${vaccineLabel(form.tipo_vacuna)} ya tiene todas sus posiciones registradas.`;
    preflightClinicalAlert = createVaccineClinicalAlert("Esquema completado", reason, form.tipo_vacuna, selectedDose);
  } else if (duplicatePosition) {
    const reason = `Ya existe una ${vaccineDoseLabel(form.tipo_vacuna, selectedDose)} de ${vaccineLabel(form.tipo_vacuna)} para esta paciente.`;
    preflightClinicalAlert = createVaccineClinicalAlert("Dosis ya registrada", reason, form.tipo_vacuna, selectedDose);
  } else if (tdapDuplicate) {
    const reason = form.momento === VACCINE_MOMENTS.BEFORE_PREGNANCY
      ? "Ya existe una Tdap previa relacionada con este embarazo."
      : "Ya existe una Tdap durante o después de este embarazo.";
    preflightClinicalAlert = createVaccineClinicalAlert("Dosis ya registrada", reason, VACCINE_TYPES.TDAP, 1);
  } else if (momentAssessment.state === "contradictory") {
    preflightClinicalAlert = createVaccineClinicalAlert(
      "Momento de aplicación incompatible",
      momentAssessment.message,
      form.tipo_vacuna,
      selectedDose
    );
  } else if (form.tipo_vacuna === VACCINE_TYPES.TDAP
    && form.momento === VACCINE_MOMENTS.DURING_PREGNANCY
    && applicationGestationalAge
    && applicationGestationalAge.totalDays < 140) {
    const reason = `La paciente tendría ${applicationGestationalAge.weeks} semanas y ${applicationGestationalAge.days} días. Tdap se permite desde las 20 semanas.`;
    preflightClinicalAlert = createVaccineClinicalAlert("Vacuna no permitida", reason, VACCINE_TYPES.TDAP, 1);
  } else if (form.tipo_vacuna === VACCINE_TYPES.SPR_SR
    && form.momento === VACCINE_MOMENTS.DURING_PREGNANCY) {
    const reason = "SR/SPR no puede registrarse como aplicada durante el embarazo.";
    preflightClinicalAlert = createVaccineClinicalAlert("Vacuna no permitida", reason, VACCINE_TYPES.SPR_SR, selectedDose);
  } else if (intervalAlert) {
    preflightClinicalAlert = intervalAlert;
  }

  const closeClinicalAlert = useCallback(() => setClinicalAlert(null), []);

  const selectVaccine = (type) => {
    const nextStatus = getVaccineStatus(type, historyWithoutCurrent, { pregnancyId: pregnancy?.id || embarazoId });
    const suggested = type === VACCINE_TYPES.INFLUENZA
      ? 1
      : nextStatus?.nextDose || firstAvailablePosition(nextStatus) || 1;
    setForm((current) => ({
      ...current,
      tipo_vacuna: type,
      numero_dosis: editando && type === current.tipo_vacuna ? current.numero_dosis : suggested,
    }));
    fieldErrors.clearFieldError("tipo_vacuna");
    fieldErrors.clearFieldError("numero_dosis");
  };

  const selectDose = (dose) => {
    setForm((current) => ({ ...current, numero_dosis: dose }));
    fieldErrors.clearFieldError("numero_dosis");
  };

  const selectMoment = (moment) => {
    setForm((current) => ({ ...current, momento: moment }));
    fieldErrors.clearFieldError("momento");
  };

  const setApplicationDate = (value) => {
    setForm((current) => ({ ...current, fecha_dosis: normalizeVaccineDate(value) }));
    fieldErrors.clearFieldError("fecha_dosis");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (loading || initialLoading || readOnly) return;
    const missing = firstMissingVaccineField(form);
    if (missing) {
      fieldErrors.setErrorsFromResponse({
        response: { data: { details: [{ campo: missing.field, mensaje: missing.message }] } },
      });
      requestAnimationFrame(() => focusVaccineField(missing.field));
      return;
    }
    if (preflightClinicalAlert) {
      setClinicalAlert(preflightClinicalAlert);
      return;
    }
    setLoading(true);
    fieldErrors.clearFieldErrors();
    const requestData = buildVaccineRequestData(form);
    try {
      const response = editando
        ? await api.put(`/pacientes/${id}/vacunas/${vacunaId}`, requestData, { params: { embarazo_id: embarazoId } })
        : await api.post(`/pacientes/${id}/vacunas`, requestData, { params: { embarazo_id: embarazoId } });
      const accepted = response.data;
      const acceptedPositions = [...new Set([
        ...(selectableStatus?.registeredPositions || []),
        Number(accepted.numero_dosis),
      ])];
      const recommendation = getAppointmentRecommendation(
        accepted.tipo_vacuna,
        accepted.numero_dosis,
        clinicalDateFromRecord(accepted),
        { existingPositions: acceptedPositions }
      );
      const message = editando
        ? "Aplicación actualizada correctamente."
        : accepted.tipo_vacuna === VACCINE_TYPES.INFLUENZA
          ? "Aplicación de Influenza registrada correctamente."
          : `${vaccineDoseLabel(accepted.tipo_vacuna, accepted.numero_dosis)} de ${vaccineLabel(accepted.tipo_vacuna)} registrada correctamente.`;
      const recommendationMessage = recommendation
        ? `Próxima aplicación recomendada: ${recommendation.nextLabel}, a partir del ${formatClinicalDateSpanish(recommendation.minimumDate, { includeWeekday: false })}.`
        : "";
      toast(message, "success");
      navigate(expedientePath, {
        replace: true,
        state: { vaccineNotice: { message, recommendationMessage } },
      });
    } catch (error) {
      const presentation = getVaccineErrorPresentation(error, {
        type: form.tipo_vacuna,
        dose: selectedDose,
        applicationDate: form.fecha_dosis,
      });
      setLoading(false);
      if (presentation.clinicalAlert) {
        fieldErrors.clearFieldErrors();
        setClinicalAlert(presentation.clinicalAlert);
      } else {
        const parsed = fieldErrors.setErrorsFromResponse(error, "No fue posible guardar la vacuna");
        toast(presentation.message || parsed.message, "error");
        if (parsed.firstField) requestAnimationFrame(() => focusVaccineField(parsed.firstField));
      }
    }
  };

  if (initialLoading) return <div className="vaccine-page-loading">Cargando contexto de vacunación...</div>;

  return (
    <div className="vaccine-form-page">
      <header className="vaccine-form-header">
        <button type="button" className="btn-secondary" onClick={() => navigate(expedientePath)}><ChevronLeft size={15} /> Volver</button>
        <div><span className="vaccine-step-label">Vacunación segura</span><h1>{editando ? "Editar vacuna" : "Registrar vacuna"}</h1><p>Registra la información que consta en el carné o antecedente presentado.</p></div>
      </header>

      {loadError ? <div className="error-box">{loadError}</div> : null}

      <form className="vaccine-flow" onSubmit={submit} noValidate>
        <section className="vaccine-flow-section">
          <div className="vaccine-section-heading"><div><span className="vaccine-step-label">Paso 1</span><h2>Selecciona la vacuna</h2></div><p>TD y Tdap se registran como vacunas diferentes.</p></div>
          <VaccineSelector selected={form.tipo_vacuna} onSelect={selectVaccine} disabled={loading || readOnly} />
          {fieldErrors.fieldError("tipo_vacuna") ? <div className="field-error-text">{fieldErrors.fieldError("tipo_vacuna")}</div> : null}
        </section>

        {form.tipo_vacuna && status ? (
          <>
            <ClinicalStatus type={form.tipo_vacuna} status={status} pregnancy={pregnancy} currentGestationalAge={currentGestationalAge} applicationGestationalAge={applicationGestationalAge} readOnly={readOnly} />

            <section className="vaccine-flow-section vaccine-application-section">
              <div className="vaccine-section-heading"><div><span className="vaccine-step-label">Paso 3</span><h2>Documenta la aplicación</h2></div><p>La información será verificada al guardar.</p></div>

              {!isInfluenza ? (
                <>
                  <DoseSelector
                    definition={selectedDefinition}
                    selected={selectedDose}
                    suggestedDose={selectableStatus?.nextDose}
                    unavailablePositions={unavailablePositions}
                    onSelect={selectDose}
                    disabled={loading || readOnly}
                  />
                  {fieldErrors.fieldError("numero_dosis") ? <div className="field-error-text">{fieldErrors.fieldError("numero_dosis")}</div> : null}
                  {missingPreviousPositions ? <div className="vaccine-clinical-message is-warning"><AlertTriangle size={18} /><span>Las dosis anteriores no constan en el sistema. Verifica el carné o antecedente presentado por la paciente.</span></div> : null}
                </>
              ) : null}

              <div className="vaccine-form-divider" />
              <MomentSelector selected={form.momento} onSelect={selectMoment} disabled={loading || readOnly} />
              {fieldErrors.fieldError("momento") ? <div className="field-error-text">{fieldErrors.fieldError("momento")}</div> : null}

              <div className="vaccine-date-row">
                <Field id="vaccine-application-date" label="Fecha de aplicación" error={fieldErrors.fieldError("fecha_dosis")} hint="Fecha clínica sin hora. No puede ser futura.">
                  <input id="vaccine-application-date" name="fecha_dosis" className={fieldErrors.inputClass("fecha_dosis")} type="date" max={today} required value={form.fecha_dosis} disabled={loading || readOnly} onChange={(event) => setApplicationDate(event.target.value)} />
                </Field>
              </div>

              {form.momento === VACCINE_MOMENTS.BEFORE_PREGNANCY && form.tipo_vacuna === VACCINE_TYPES.TDAP ? <p className="vaccine-context-note">Esta Tdap quedará como antecedente previo y no consumirá la aplicación correspondiente al embarazo actual.</p> : null}
              {momentAssessment.state === "unverifiable" ? <div className="vaccine-clinical-message is-warning"><AlertTriangle size={18} /><span>{momentAssessment.message}</span></div> : null}
              {editando ? <p className="vaccine-context-note"><strong>Importante:</strong> modificar la fecha, posición o momento puede alterar la cronología conocida. La información será verificada al guardar.</p> : null}
              {preflightClinicalAlert && preflightClinicalAlert.kind !== "interval" ? <div className="vaccine-blocking-message" role="alert"><AlertTriangle size={19} /><span>{preflightClinicalAlert.reason}</span></div> : null}
              {fieldErrors.summary.length > 0 ? <div className="error-box" role="alert"><strong>Revisa estos datos:</strong> {fieldErrors.summary.map((error) => `${error.label}: ${error.message}`).join(" | ")}</div> : null}
              {intervalAlert ? <IntervalWarningCard alert={intervalAlert} /> : <AppointmentCard recommendation={previewRecommendation} preview />}
            </section>

            <VaccineHistory type={form.tipo_vacuna} status={status} pregnancy={pregnancy} />

            <footer className="vaccine-form-actions">
              <button type="button" className="btn-secondary" onClick={() => navigate(expedientePath)}>Volver al historial</button>
              <button ref={submitButtonRef} type="submit" className="btn-primary" disabled={loading || initialLoading || readOnly}><Save size={15} /> {loading ? "Guardando..." : editando ? "Guardar cambios" : "Registrar aplicación"}</button>
            </footer>
          </>
        ) : null}
      </form>
      {clinicalAlert ? (
        <VaccineClinicalDialog
          alert={clinicalAlert}
          onClose={closeClinicalAlert}
          returnFocusRef={submitButtonRef}
        />
      ) : null}
    </div>
  );
}
