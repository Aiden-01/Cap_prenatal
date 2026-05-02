import { useEffect, useMemo, useRef, useState } from "react";
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

const QUICK_PROMPTS = [
  "Como calculo la FPP?",
  "Como registro una paciente?",
  "Como agrego un control prenatal?",
  "Donde veo reportes?",
];

const initialMessages = [
  {
    id: "welcome",
    from: "bot",
    text: "Hola. Puedo ayudarte con el uso del sistema: pacientes, controles, FPP, riesgo, vacunas, reportes y usuarios.",
    intent: "bienvenida",
  },
];

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState({});
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messageIdRef = useRef(0);

  const createMessageId = (prefix) => {
    messageIdRef.current += 1;
    return `${prefix}-${messageIdRef.current}`;
  };

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

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const { data } = await api.post("/chatbot/mensaje", { mensaje: cleanText });
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
      setMessages((current) => [...current, botMessage]);
    } catch {
      setMessages((current) => [
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
                <strong>Asistente del sistema</strong>
                <span>Respuestas cerradas y verificables</span>
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
                <span>Buscando respuesta segura...</span>
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
            <span>Esto te ayudo?</span>
            <button
              type="button"
              onClick={() => sendFeedback(true)}
              disabled={!lastBotMessage || feedbackSent[lastBotMessage.id]}
              title="Si ayudo"
            >
              <ThumbsUp size={15} />
            </button>
            <button
              type="button"
              onClick={() => sendFeedback(false)}
              disabled={!lastBotMessage || feedbackSent[lastBotMessage.id]}
              title="No ayudo"
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
              placeholder="Escribe tu duda..."
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
