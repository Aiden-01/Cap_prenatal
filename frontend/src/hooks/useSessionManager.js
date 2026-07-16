import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/axios";
import { createSessionLifecycle } from "../utils/sessionLifecycle";
import {
  AUTH_CHANNEL_NAME,
  readAuthLifecycleState,
  recordAuthLifecycleState,
  sessionNoticeForCode,
} from "../utils/sessionSecurity";

const DEFAULTS = {
  idleTimeoutSeconds: 15 * 60,
  warningAfterSeconds: 13 * 60,
  activityUpdateSeconds: 60,
};

const EMPTY_STATE = {
  userId: null,
  visible: false,
  remainingSeconds: 0,
  continuing: false,
  error: "",
};

export function useSessionManager({ usuario, onSessionEnd }) {
  const [sessionState, setSessionState] = useState(EMPTY_STATE);
  const lifecycleRef = useRef(null);
  const onSessionEndRef = useRef(onSessionEnd);
  const userMetadataRef = useRef(usuario);

  useEffect(() => {
    onSessionEndRef.current = onSessionEnd;
  }, [onSessionEnd]);

  useEffect(() => {
    userMetadataRef.current = usuario;
  }, [usuario]);

  const idleTimeoutSeconds = usuario?.idleTimeoutSeconds || DEFAULTS.idleTimeoutSeconds;
  const warningAfterSeconds = usuario?.warningAfterSeconds || DEFAULTS.warningAfterSeconds;
  const activityUpdateSeconds = usuario?.activityUpdateSeconds || DEFAULTS.activityUpdateSeconds;
  const absoluteExpiresAt = usuario?.absoluteExpiresAt || "9999-12-31T23:59:59.999Z";

  useEffect(() => {
    if (!usuario?.id) {
      lifecycleRef.current = null;
      return undefined;
    }

    const channel = typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel(AUTH_CHANNEL_NAME);
    const lifecycle = createSessionLifecycle({
      userId: usuario.id,
      lastActivityAt: userMetadataRef.current?.lastActivityAt,
      absoluteExpiresAt,
      warningAfterSeconds,
      idleTimeoutSeconds,
      activityUpdateSeconds,
      requestActivity: ({ signal, explicit }) => api.post("/auth/activity", {}, {
        signal,
        timeout: explicit ? 15_000 : undefined,
        // El ciclo de sesión distingue un rechazo definitivo de un fallo de red.
        // Evita que el interceptor y el modal ejecuten dos cierres simultáneos.
        skipAuthRedirect: true,
      }),
      onStateChange: setSessionState,
      onSessionContinued: recordAuthLifecycleState,
      readLatestSessionState: readAuthLifecycleState,
      onSessionEnd: ({ code, localOnly, broadcastMetadata }) => {
        onSessionEndRef.current(
          sessionNoticeForCode(code),
          "session-expired",
          broadcastMetadata,
          { localOnly }
        );
      },
      eventTarget: window,
      channel,
      setIntervalFn: window.setInterval.bind(window),
      clearIntervalFn: window.clearInterval.bind(window),
    });
    lifecycleRef.current = lifecycle;
    lifecycle.mount();

    return () => {
      lifecycle.dispose();
      if (lifecycleRef.current === lifecycle) lifecycleRef.current = null;
    };
  }, [
    absoluteExpiresAt,
    activityUpdateSeconds,
    idleTimeoutSeconds,
    usuario?.id,
    warningAfterSeconds,
  ]);

  // /auth/me puede refrescar metadata al recuperar el foco. Para el mismo
  // usuario solo avanzamos el reloj de forma monotónica; nunca abortamos una
  // continuación explícita ni hacemos retroceder la actividad confirmada.
  useEffect(() => {
    lifecycleRef.current?.syncServerActivityAt(usuario?.lastActivityAt);
  }, [usuario?.id, usuario?.lastActivityAt]);

  const continueSession = useCallback(
    () => lifecycleRef.current?.continueSession() ?? Promise.resolve(false),
    []
  );

  return {
    ...sessionState,
    visible: sessionState.userId === usuario?.id && sessionState.visible,
    continueSession,
  };
}
