import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useChatbotScreenContext } from "./useChatbotScreenContext";
import { VACCINE_TYPES } from "../utils/vaccineSchedule";

// Publica solo una categoría cerrada de interfaz, asociada a esta navegación.
export function useChatbotVaccineScreen(vaccineType) {
  const { key: navigationKey } = useLocation();
  const { setVaccineScreen } = useChatbotScreenContext();
  useEffect(() => {
    setVaccineScreen({
      navigationKey,
      vaccineType: Object.values(VACCINE_TYPES).includes(vaccineType) ? vaccineType : null,
    });
    return () => setVaccineScreen(null);
  }, [navigationKey, vaccineType, setVaccineScreen]);
}
