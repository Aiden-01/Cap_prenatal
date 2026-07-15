import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/axios";
import { REAL_ACTIVITY_EVENTS, sessionPhase } from "../utils/sessionSecurity";

const DEFAULTS = {
  idleTimeoutSeconds: 15 * 60,
  warningAfterSeconds: 13 * 60,
  activityUpdateSeconds: 60,
};

export function useSessionManager({ usuario, onSessionEnd }) {
  const [warning, setWarning] = useState({ userId: null, visible: false, remainingSeconds: 0, continuing: false });
  const lastConfirmedRef = useRef(null);
  const lastSentRef = useRef(0);
  const activityPromiseRef = useRef(null);
  const activityAbortRef = useRef(null);
  const identityGenerationRef = useRef(0);
  const endedRef = useRef(false);
  const onSessionEndRef = useRef(onSessionEnd);

  useEffect(() => {
    onSessionEndRef.current = onSessionEnd;
  }, [onSessionEnd]);

  const idleTimeoutSeconds = usuario?.idleTimeoutSeconds || DEFAULTS.idleTimeoutSeconds;
  const warningAfterSeconds = usuario?.warningAfterSeconds || DEFAULTS.warningAfterSeconds;
  const activityUpdateSeconds = usuario?.activityUpdateSeconds || DEFAULTS.activityUpdateSeconds;
  const absoluteExpiresAt = usuario?.absoluteExpiresAt
    || "9999-12-31T23:59:59.999Z";

  useEffect(() => {
    identityGenerationRef.current += 1;
    activityAbortRef.current?.abort();
    activityAbortRef.current = null;
    activityPromiseRef.current = null;
    const serverActivity = new Date(usuario?.lastActivityAt || "").getTime();
    lastConfirmedRef.current = Number.isFinite(serverActivity) ? serverActivity : Date.now();
    lastSentRef.current = 0;
    endedRef.current = false;
  }, [usuario?.id, usuario?.lastActivityAt]);

  const sendActivity = useCallback(async ({ force = false } = {}) => {
    if (!usuario || endedRef.current) return false;
    const now = Date.now();
    if (!force && now - lastSentRef.current < activityUpdateSeconds * 1000) return false;
    if (activityPromiseRef.current) return activityPromiseRef.current;
    lastSentRef.current = now;
    const generation = identityGenerationRef.current;
    const controller = new AbortController();
    activityAbortRef.current = controller;
    const activityPromise = api.post("/auth/activity", {}, { signal: controller.signal })
      .then(() => {
        if (generation !== identityGenerationRef.current) return false;
        lastConfirmedRef.current = Date.now();
        setWarning({ userId: usuario.id, visible: false, remainingSeconds: 0, continuing: false });
        return true;
      })
      .catch((error) => {
        if (generation === identityGenerationRef.current) lastSentRef.current = 0;
        throw error;
      })
      .finally(() => {
        if (activityPromiseRef.current === activityPromise) activityPromiseRef.current = null;
        if (activityAbortRef.current === controller) activityAbortRef.current = null;
      });
    activityPromiseRef.current = activityPromise;
    return activityPromise;
  }, [activityUpdateSeconds, usuario]);

  useEffect(() => () => activityAbortRef.current?.abort(), []);

  useEffect(() => {
    if (!usuario) return undefined;
    const handleActivity = (event) => {
      if (!event.isTrusted || !REAL_ACTIVITY_EVENTS.has(event.type)) return;
      sendActivity().catch(() => {
        // El interceptor central procesa cualquier estado de sesión inválido.
      });
    };
    for (const eventName of REAL_ACTIVITY_EVENTS) {
      window.addEventListener(eventName, handleActivity, { capture: true, passive: true });
    }
    return () => {
      for (const eventName of REAL_ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, handleActivity, { capture: true });
      }
    };
  }, [sendActivity, usuario]);

  useEffect(() => {
    if (!usuario) return undefined;
    const check = () => {
      const state = sessionPhase({
        lastConfirmedActivityAt: lastConfirmedRef.current || Date.now(),
        now: Date.now(),
        warningAfterSeconds,
        idleTimeoutSeconds,
        absoluteExpiresAt,
      });
      if (state.phase === "expired" && !endedRef.current) {
        endedRef.current = true;
        api.post("/auth/logout", {}, { skipAuthRefresh: true, skipAuthRedirect: true }).catch(() => {});
        onSessionEndRef.current("La sesión se cerró por inactividad.", "session-expired");
        return;
      }
      setWarning((current) => ({
        ...current,
        userId: usuario.id,
        visible: state.phase === "warning",
        remainingSeconds: state.remainingSeconds,
      }));
    };
    check();
    const timer = window.setInterval(check, 1000);
    return () => window.clearInterval(timer);
  }, [absoluteExpiresAt, idleTimeoutSeconds, usuario, warningAfterSeconds]);

  const continueSession = useCallback(async () => {
    setWarning((current) => ({ ...current, continuing: true }));
    try {
      await sendActivity({ force: true });
    } catch {
      if (!endedRef.current) {
        endedRef.current = true;
        onSessionEndRef.current("La sesión ya no es válida. Inicia sesión nuevamente.", "session-expired");
      }
    } finally {
      setWarning((current) => ({ ...current, continuing: false }));
    }
  }, [sendActivity]);

  return {
    ...warning,
    visible: warning.userId === usuario?.id && warning.visible,
    continueSession,
  };
}
