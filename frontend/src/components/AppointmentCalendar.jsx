import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, X } from "lucide-react";
import api from "../api/axios";
import { useGlobalToast } from "../context/ToastContext";
import { getErrorMessage } from "../utils/errorMessage";
import {
  WEEKDAY_LABELS,
  formatAccessibleDate,
  formatDayHeading,
  formatMonthLabel,
  getCalendarDays,
  getVisibleCalendarRange,
  groupAppointmentsByDate,
  isDateInMonth,
  isDateWithinRange,
  parseDateOnly,
  shiftMonth,
  startOfMonth,
  todayInGuatemala,
} from "../utils/appointmentCalendar";
import AppointmentActionDialog from "./AppointmentActionDialog";
import AppointmentDetailDialog from "./AppointmentDetailDialog";
import { AppointmentStatusIcon } from "./AppointmentStatus";
import { APPOINTMENT_STATUS, getAppointmentStatus } from "./appointmentStatusMeta";
import "./appointment-calendar.css";

const MAX_EVENTS_PER_CELL = 3;
const EMPTY_ITEMS = Object.freeze([]);

function appointmentAccessibleName(appointment) {
  const status = getAppointmentStatus(appointment.status);
  const community = appointment.community
    ? `, comunidad ${appointment.community}`
    : ", sin comunidad registrada";
  return `${appointment.patient_name}, ${status.accessible}, ${formatAccessibleDate(appointment.date)}${community}`;
}

function AppointmentEvent({ appointment, onSelect }) {
  const status = getAppointmentStatus(appointment.status);
  return (
    <button
      type="button"
      className={`calendar-event ${status.className}`}
      onClick={(event) => onSelect(event, appointment)}
      aria-label={appointmentAccessibleName(appointment)}
    >
      <AppointmentStatusIcon status={appointment.status} size={13} />
      <span className="calendar-event-copy">
        <strong>{appointment.patient_name}</strong>
        <small>{appointment.community || "Sin comunidad"}</small>
      </span>
    </button>
  );
}

function DayAgenda({ date, items, onSelect, onClose, returnFocusTarget }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const skipRestoreRef = useRef(false);
  const titleId = useId();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "Tab") {
        const focusable = [...dialogRef.current.querySelectorAll("button:not([disabled])")];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (!skipRestoreRef.current) requestAnimationFrame(() => returnFocusTarget?.focus());
    };
  }, [onClose, returnFocusTarget]);

  return (
    <div className="appointment-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
    <section ref={dialogRef} className="appointment-dialog appointment-day-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="appointment-day-agenda-heading">
        <div>
          <span>Citas del día</span>
          <h2 id={titleId}>{formatDayHeading(date)}</h2>
        </div>
        <span className="badge badge-blue">
          {items.length} cita{items.length === 1 ? "" : "s"}
        </span>
        <button ref={closeRef} type="button" className="appointment-detail-close" onClick={onClose} aria-label="Cerrar citas del día"><X size={20} aria-hidden="true" /></button>
      </div>
      {items.length ? (
        <div className="appointment-day-list">
          {items.map((appointment) => {
            const status = getAppointmentStatus(appointment.status);
            return (
              <button
                type="button"
                key={appointment.id}
                className={`appointment-day-item ${status.className}`}
                onClick={(event) => { skipRestoreRef.current = true; onSelect(event, appointment); }}
                aria-label={appointmentAccessibleName(appointment)}
              >
                <span className="appointment-day-icon">
                  <AppointmentStatusIcon status={appointment.status} size={18} />
                </span>
                <span className="appointment-day-copy">
                  <strong>{appointment.patient_name}</strong>
                  <small>{appointment.community || "Sin comunidad registrada"}</small>
                </span>
                <span className={`appointment-status-badge ${status.className}`}>{status.label}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="appointment-day-empty">No hay citas registradas para este día.</p>
      )}
    </section>
    </div>
  );
}

export default function AppointmentCalendar({ canManageAppointments, onViewPatient }) {
  const titleId = useId();
  const toast = useGlobalToast();
  const today = useMemo(() => todayInGuatemala(), []);
  const [month, setMonth] = useState(() => startOfMonth(today));
  const [selectedDay, setSelectedDay] = useState(today);
  const [dayAgenda, setDayAgenda] = useState(null);
  const [items, setItems] = useState([]);
  const [loadedRangeKey, setLoadedRangeKey] = useState("");
  const [requestState, setRequestState] = useState({ loading: true, error: "" });
  const [retryToken, setRetryToken] = useState(0);
  const [detail, setDetail] = useState(null);
  const [actionDialog, setActionDialog] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const requestIdentity = useRef(0);

  const range = useMemo(() => getVisibleCalendarRange(month), [month]);
  const rangeKey = `${range.from}:${range.to}`;
  const days = useMemo(() => getCalendarDays(month), [month]);
  const visibleItems = useMemo(
    () => loadedRangeKey === rangeKey ? items : EMPTY_ITEMS,
    [items, loadedRangeKey, rangeKey]
  );
  const itemsByDate = useMemo(() => groupAppointmentsByDate(visibleItems), [visibleItems]);
  const selectedItems = itemsByDate.get(selectedDay) || [];
  const monthItemCount = visibleItems.filter((item) => isDateInMonth(item.date, month)).length;
  const { loading, error } = requestState;

  useEffect(() => {
    const identity = requestIdentity.current + 1;
    requestIdentity.current = identity;
    const controller = new AbortController();

    api.get("/citas/calendario", {
      params: { from: range.from, to: range.to },
      signal: controller.signal,
    }).then(({ data }) => {
      if (requestIdentity.current !== identity) return;
      setItems(Array.isArray(data?.items) ? data.items : []);
      setLoadedRangeKey(rangeKey);
      setRequestState({ loading: false, error: "" });
    }).catch((requestError) => {
      if (
        controller.signal.aborted
        || requestError?.code === "ERR_CANCELED"
        || requestError?.name === "CanceledError"
      ) return;
      if (requestIdentity.current !== identity) return;
      setLoadedRangeKey("");
      setRequestState({
        loading: false,
        error: getErrorMessage(requestError, "No se pudieron cargar las citas del mes."),
      });
    });

    return () => controller.abort();
  }, [range.from, range.to, rangeKey, retryToken]);

  const changeMonth = (nextMonth) => {
    setRequestState({ loading: true, error: "" });
    setMonth(nextMonth);
    setSelectedDay(isDateInMonth(today, nextMonth) ? today : nextMonth);
    setDayAgenda(null);
  };

  const selectDay = (date, returnFocusTarget) => {
    setSelectedDay(date);
    setDayAgenda({ returnFocusTarget });
  };

  const openDetail = useCallback((event, appointment) => {
    event.stopPropagation();
    setDayAgenda(null);
    setDetail({ appointment, returnFocusTarget: dayAgenda?.returnFocusTarget || event.currentTarget });
  }, [dayAgenda]);

  const beginAction = (mode) => {
    if (!detail) return;
    setActionError("");
    setActionDialog({
      mode,
      appointment: detail.appointment,
      returnFocusTarget: detail.returnFocusTarget,
    });
    setDetail(null);
  };

  const closeActionDialog = useCallback(() => {
    if (actionBusy) return;
    setActionDialog(null);
    setActionError("");
  }, [actionBusy]);

  const confirmAction = async (newDate) => {
    if (!actionDialog) return;
    const { appointment, mode } = actionDialog;
    const isMissedFollowUp = mode === "reprogramar" && (
      appointment.status === "inasistente"
      || (appointment.status === "programada" && appointment.date < today)
    );
    setActionBusy(true);
    setActionError("");
    try {
      const endpoint = `/pacientes/${appointment.patient_id}/citas/${appointment.id}/${mode}?embarazo_id=${appointment.pregnancy_id}`;
      const { data } = await api.patch(
        endpoint,
        mode === "reprogramar" ? { fecha_programada: newDate } : {}
      );

      if (!isMissedFollowUp) setItems((current) => {
        if (mode === "cancelar") {
          return current.map((item) => String(item.id) === String(appointment.id)
            ? { ...item, status: "cancelada", editable: false }
            : item);
        }

        const originalUpdated = current.map((item) => String(item.id) === String(appointment.id)
          ? { ...item, status: "reprogramada", editable: false, rescheduled_to: newDate }
          : item);
        if (!isDateWithinRange(newDate, range)) return originalUpdated;
        const childId = data?.cita_nueva?.id;
        if (!childId || originalUpdated.some((item) => String(item.id) === String(childId))) {
          return originalUpdated;
        }
        return [...originalUpdated, {
          ...appointment,
          id: String(childId),
          date: newDate,
          status: "programada",
          rescheduled_to: null,
          editable: true,
        }];
      });

      setActionDialog(null);
      if (isMissedFollowUp) {
        setRequestState({ loading: true, error: "" });
        setRetryToken((value) => value + 1);
      }
      toast?.(
        isMissedFollowUp
          ? "Nueva cita asignada correctamente."
          : mode === "reprogramar" ? "Cita reprogramada correctamente." : "Cita cancelada correctamente.",
        "success"
      );
    } catch (requestError) {
      setActionError(getErrorMessage(requestError, "No fue posible actualizar la cita."));
      if (isMissedFollowUp) {
        setRetryToken((value) => value + 1);
      }
    } finally {
      setActionBusy(false);
    }
  };

  const goToday = () => {
    const currentMonth = startOfMonth(today);
    if (month !== currentMonth) changeMonth(currentMonth);
    setSelectedDay(today);
    setDayAgenda({ returnFocusTarget: document.activeElement });
  };

  return (
    <section className="appointment-calendar card" aria-labelledby={titleId}>
      <header className="appointment-calendar-header">
        <div>
          <span className="appointment-calendar-eyebrow">Agenda prenatal</span>
          <h2 id={titleId}>Calendario de citas</h2>
          <p>Consulta y gestiona las citas estructuradas disponibles por mes.</p>
        </div>
        <div className="appointment-calendar-navigation" aria-label="Navegación mensual">
          <button type="button" className="btn-secondary" onClick={goToday}>
            <RotateCcw size={15} aria-hidden="true" /> Hoy
          </button>
          <div className="appointment-month-switcher">
            <button
              type="button"
              onClick={() => changeMonth(shiftMonth(month, -1))}
              aria-label="Mes anterior"
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <strong aria-live="polite">{formatMonthLabel(month)}</strong>
            <button
              type="button"
              onClick={() => changeMonth(shiftMonth(month, 1))}
              aria-label="Mes siguiente"
            >
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <div className="appointment-status-legend" aria-label="Leyenda de estados">
        {Object.entries(APPOINTMENT_STATUS).map(([statusKey, status]) => (
          <span key={statusKey} className={status.className}>
            <AppointmentStatusIcon status={statusKey} size={14} /> {status.label}
          </span>
        ))}
      </div>

      {loading ? (
        <div className="calendar-feedback is-loading" role="status" aria-live="polite">
          <span>Cargando citas del mes...</span>
          <span className="calendar-skeleton-lines" aria-hidden="true"><i /><i /><i /></span>
        </div>
      ) : null}
      {error ? (
        <div className="calendar-feedback is-error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn-secondary" onClick={() => {
            setRequestState({ loading: true, error: "" });
            setRetryToken((value) => value + 1);
          }}>
            Reintentar
          </button>
        </div>
      ) : null}

      <div className="appointment-calendar-table-wrap" aria-busy={loading}>
        <table className="appointment-calendar-table">
          <caption className="calendar-sr-only">
            Calendario mensual de citas prenatales, {formatMonthLabel(month)}. La semana comienza en domingo.
          </caption>
          <thead>
            <tr>
              {WEEKDAY_LABELS.map((label) => <th key={label} scope="col">{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }, (_, weekIndex) => (
              <tr key={days[weekIndex * 7]}>
                {days.slice(weekIndex * 7, (weekIndex + 1) * 7).map((date) => {
                  const dayItems = itemsByDate.get(date) || [];
                  const visibleEvents = dayItems.slice(0, MAX_EVENTS_PER_CELL);
                  const extra = Math.max(0, dayItems.length - visibleEvents.length);
                  const isToday = date === today;
                  const day = parseDateOnly(date)?.day;
                  return (
                    <td
                      key={date}
                      className={[
                        isDateInMonth(date, month) ? "" : "is-outside-month",
                        isToday ? "is-today" : "",
                        selectedDay === date ? "is-selected" : "",
                      ].filter(Boolean).join(" ")}
                    >
                      <button type="button" className="calendar-cell-button" onClick={(event) => selectDay(date, event.currentTarget)} aria-label={`Ver citas del ${formatAccessibleDate(date)}`} tabIndex={-1} />
                      <div className="calendar-day-heading">
                        <button
                          type="button"
                          className="calendar-day-button"
                          onClick={(event) => { event.stopPropagation(); selectDay(date, event.currentTarget); }}
                          aria-label={`Ver citas del ${formatAccessibleDate(date)}`}
                          aria-pressed={selectedDay === date}
                        >
                          {day}
                        </button>
                        {isToday ? <span className="calendar-today-label">Hoy</span> : null}
                        {dayItems.length ? (
                          <span className="calendar-mobile-count" aria-hidden="true">{dayItems.length}</span>
                        ) : null}
                      </div>
                      <div className="calendar-events">
                        {visibleEvents.map((appointment) => (
                          <AppointmentEvent
                            key={appointment.id}
                            appointment={appointment}
                            onSelect={openDetail}
                          />
                        ))}
                        {extra ? (
                          <button
                            type="button"
                            className="calendar-more-button"
                            onClick={(event) => { event.stopPropagation(); selectDay(date, event.currentTarget); }}
                            aria-label={`Mostrar ${extra} citas más del ${formatAccessibleDate(date)}`}
                          >
                            +{extra} más
                          </button>
                        ) : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && !error && monthItemCount === 0 ? (
        <p className="appointment-calendar-empty">No hay citas registradas en este mes.</p>
      ) : null}

      {dayAgenda ? <DayAgenda
        date={selectedDay}
        items={selectedItems}
        onSelect={openDetail}
        onClose={() => setDayAgenda(null)}
        returnFocusTarget={dayAgenda.returnFocusTarget}
      /> : null}

      {detail ? (
        <AppointmentDetailDialog
          appointment={detail.appointment}
          canManage={canManageAppointments}
          onAction={beginAction}
          onClose={() => setDetail(null)}
          onViewPatient={() => onViewPatient(detail.appointment.patient_id)}
          returnFocusTarget={detail.returnFocusTarget}
        />
      ) : null}

      {actionDialog ? (
        <AppointmentActionDialog
          mode={actionDialog.mode}
          appointment={actionDialog.appointment}
          busy={actionBusy}
          error={actionError}
          onClose={closeActionDialog}
          onConfirm={confirmAction}
          returnFocusTarget={actionDialog.returnFocusTarget}
        />
      ) : null}
    </section>
  );
}
