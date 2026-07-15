import { useContext } from "react";
import { ChatbotScreenContext } from "../context/chatbotScreenContextValue";

export function useChatbotScreenContext() {
  const context = useContext(ChatbotScreenContext);
  if (!context) {
    throw new Error("useChatbotScreenContext requiere ChatbotScreenProvider");
  }
  return context;
}
