import { useCallback, useMemo, useState } from "react";
import { ChatbotScreenContext } from "./chatbotScreenContextValue";

const VALID_PREGNANCY_STATUSES = new Set(["activo", "puerperio", "cerrado"]);

export function ChatbotScreenProvider({ children }) {
  const [pregnancyStatus, setStoredPregnancyStatus] = useState(null);

  const setPregnancyStatus = useCallback((status) => {
    setStoredPregnancyStatus(VALID_PREGNANCY_STATUSES.has(status) ? status : null);
  }, []);

  const value = useMemo(() => ({
    pregnancyStatus,
    setPregnancyStatus,
  }), [pregnancyStatus, setPregnancyStatus]);

  return (
    <ChatbotScreenContext.Provider value={value}>
      {children}
    </ChatbotScreenContext.Provider>
  );
}
