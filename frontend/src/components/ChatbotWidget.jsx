import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Bot,
  HelpCircle,
  MessageCircle,
  Send,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import api from "../api/axios";
import { useAuth } from "../hooks/useAuth";
import { useChatbotScreenContext } from "../hooks/useChatbotScreenContext";
import { buildChatbotContext } from "../utils/chatbotContext";

const ASSISTANT_NAME = "Lia";
const MIN_RESPONSE_DELAY_MS = 850;

const QUICK_PROMPTS = [
  "Quiero registrar una paciente",
  "Necesito agregar un control prenatal",
  "Ayúdame con ficha de riesgo",
  "¿Cómo funciona el mapa de riesgo?",
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFirstName(usuario) {
  const fullName = usuario?.nombre_completo || usuario?.username || "";
  return fullName.trim().split(/\s+/)[0] || "";
}

function buildWelcomeMessage(firstName) {
  const greeting = firstName ? `¡Hola, ${firstName}!` : "¡Hola!";
  return {
    id: "welcome",
    from: "bot",
    text: `${greeting} Soy ${ASSISTANT_NAME}, tu asistente en el sistema del CAP El Chal 👋\nEstoy aquí para ayudarte con lo que necesites: registrar pacientes, agregar controles, revisar riesgos o resolver dudas del sistema.\n¿En qué te ayudo hoy?`,
    intent: "bienvenida",
  };
}

export default function ChatbotWidget() {
  const { usuario } = useAuth();
  const location = useLocation();
  const { pregnancyStatus } = useChatbotScreenContext();
  const firstName = getFirstName(usuario);
  const identityKey = String(usuario?.id || usuario?.username || "anonymous");
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState(() => ({
    identityKey,
    messages: [],
  }));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState({});
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messageIdRef = useRef(0);
  const safeContext = useMemo(() => buildChatbotContext({
    pathname: location.pathname,
    search: location.search,
    usuario,
    pregnancyStatus,
  }), [location.pathname, location.search, pregnancyStatus, usuario]);

  const createMessageId = (prefix) => {
    messageIdRef.current += 1;
    return `${prefix}-${messageIdRef.current}`;
  };

  const updateMessages = (updater) => {
    setConversation((current) => {
      const currentMessages = current.identityKey === identityKey ? current.messages : [];
      return {
        identityKey,
        messages: updater(currentMessages),
      };
    });
  };

  const messages = useMemo(() => {
    const currentMessages = conversation.identityKey === identityKey
      ? conversation.messages
      : [];
    return [buildWelcomeMessage(firstName), ...currentMessages];
  }, [conversation, firstName, identityKey]);

  const lastBotMessage = useMemo(
    () => [...messages].reverse().find((message) => message.from === "bot"),
    [messages]
  );

  const openChat = () => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 120);
  };

  useEffect(() => {
    if (!open) return;
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, loading, open]);

  const sendMessage = async (text = input) => {
    const cleanText = text.trim();
    if (!cleanText || loading) return;

    const userMessage = {
      id: createMessageId("user"),
      from: "user",
      text: cleanText,
    };

    updateMessages((current) => [...current, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const [{ data }] = await Promise.all([
        api.post("/chatbot/mensaje", { mensaje: cleanText, context: safeContext }),
        wait(MIN_RESPONSE_DELAY_MS),
      ]);
      const botMessage = {
        id: createMessageId("bot"),
        from: "bot",
        text: data.answer,
        intent: data.intent,
        title: data.title,
        recognized: data.recognized,
        disclaimer: data.disclaimer,
        suggestions: data.suggestions || [],
      };
      updateMessages((current) => [...current, botMessage]);
    } catch {
      updateMessages((current) => [
        ...current,
        {
          id: createMessageId("bot-error"),
          from: "bot",
          text: "No pude consultar el asistente en este momento. Intenta nuevamente.",
          intent: "error",
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  };

  const sendFeedback = async (helpful) => {
    if (!lastBotMessage || feedbackSent[lastBotMessage.id]) return;
    setFeedbackSent((current) => ({ ...current, [lastBotMessage.id]: true }));

    try {
      await api.post("/chatbot/feedback", {
        helpful,
        intent: lastBotMessage.intent,
        mensaje: lastBotMessage.text,
      });
    } catch {
      setFeedbackSent((current) => ({ ...current, [lastBotMessage.id]: false }));
    }
  };

  return (
    <div className={`chatbot-widget ${open ? "is-open" : ""}`} aria-live="polite">
      {open && (
        <section className="chatbot-panel" aria-label="Asistente de ayuda">
          <header className="chatbot-header">
            <div className="chatbot-title">
              <span className="chatbot-avatar">
                <Bot size={18} />
              </span>
              <div>
                <strong>{ASSISTANT_NAME}</strong>
                <span>Tu asistente personal del CAP prenatal</span>
              </div>
            </div>
            <button
              type="button"
              className="chatbot-icon-btn"
              onClick={() => setOpen(false)}
              title="Cerrar asistente"
            >
              <X size={18} />
            </button>
          </header>

          <div className="chatbot-messages">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`chatbot-message ${message.from === "user" ? "is-user" : "is-bot"}`}
              >
                {message.title && <strong>{message.title}</strong>}
                <p>{message.text}</p>
                {message.disclaimer && <small>{message.disclaimer}</small>}
                {message.suggestions?.length > 0 && (
                  <div className="chatbot-suggestions">
                    {message.suggestions.slice(0, 4).map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => sendMessage(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </article>
            ))}

            {loading && (
              <div className="chatbot-loading">
                <span className="chatbot-typing" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span>Lia está escribiendo...</span>
              </div>
            )}
            <div ref={messagesEndRef} className="chatbot-scroll-anchor" />
          </div>

          <div className="chatbot-quick">
            {QUICK_PROMPTS.map((prompt) => (
              <button key={prompt} type="button" onClick={() => sendMessage(prompt)}>
                {prompt}
              </button>
            ))}
          </div>

          <div className="chatbot-feedback">
            <span>¿Te sirvió?</span>
            <button
              type="button"
              onClick={() => sendFeedback(true)}
              disabled={!lastBotMessage || feedbackSent[lastBotMessage.id]}
              title="Sí ayudó"
            >
              <ThumbsUp size={15} />
            </button>
            <button
              type="button"
              onClick={() => sendFeedback(false)}
              disabled={!lastBotMessage || feedbackSent[lastBotMessage.id]}
              title="No ayudó"
            >
              <ThumbsDown size={15} />
            </button>
          </div>

          <form
            className="chatbot-form"
            onSubmit={(event) => {
              event.preventDefault();
              sendMessage();
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={`Escríbele a ${ASSISTANT_NAME}...`}
              aria-label="Mensaje para el asistente"
            />
            <button type="submit" disabled={loading || !input.trim()} title="Enviar">
              <Send size={17} />
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        className="chatbot-toggle"
        onClick={open ? () => setOpen(false) : openChat}
        title={open ? "Cerrar asistente" : "Abrir asistente"}
      >
        {open ? <HelpCircle size={24} /> : <MessageCircle size={24} />}
      </button>
    </div>
  );
}
