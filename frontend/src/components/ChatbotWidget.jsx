import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
import {
  conversationForIdentity,
  createConversationMemory,
  createEmptyConversation,
} from "../utils/chatbotConversation";
import {
  chatbotContextKey,
  normalizeQuickActions,
  resolveQuickActionTarget,
  visibleQuickActions,
} from "../utils/chatbotQuickActions";

const ASSISTANT_NAME = "Lia";
const MIN_RESPONSE_DELAY_MS = 850;

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
  const navigate = useNavigate();
  const { pregnancyStatus } = useChatbotScreenContext();
  const firstName = getFirstName(usuario);
  const identityKey = String(usuario?.id || usuario?.username || "anonymous");
  const [open, setOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState(() => ({
    identityKey,
    messages: [],
  }));
  const [conversationMemory, setConversationMemory] = useState(() => (
    createConversationMemory(identityKey, createEmptyConversation())
  ));
  const [inputState, setInputState] = useState(() => ({ identityKey, value: "" }));
  const [requestUiState, setRequestUiState] = useState(() => ({
    identityKey,
    loading: false,
  }));
  const [feedbackState, setFeedbackState] = useState(() => ({
    identityKey,
    sent: {},
  }));
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messageIdRef = useRef(0);
  const requestInFlightRef = useRef(false);
  const activeRequestRef = useRef(null);
  const lastNavigationRef = useRef(null);
  const safeContext = useMemo(() => buildChatbotContext({
    pathname: location.pathname,
    search: location.search,
    usuario,
    pregnancyStatus,
  }), [location.pathname, location.search, pregnancyStatus, usuario]);
  const safeConversation = conversationForIdentity(conversationMemory, identityKey);
  const currentContextKey = chatbotContextKey(safeContext);
  const input = inputState.identityKey === identityKey ? inputState.value : "";
  const loading = requestUiState.identityKey === identityKey && requestUiState.loading;
  const feedbackSent = feedbackState.identityKey === identityKey ? feedbackState.sent : {};

  const createMessageId = (prefix) => {
    messageIdRef.current += 1;
    return `${prefix}-${messageIdRef.current}`;
  };

  const updateMessages = (updater) => {
    setChatHistory((current) => {
      const currentMessages = current.identityKey === identityKey ? current.messages : [];
      return {
        identityKey,
        messages: updater(currentMessages),
      };
    });
  };

  const messages = useMemo(() => {
    const currentMessages = chatHistory.identityKey === identityKey
      ? chatHistory.messages
      : [];
    return [buildWelcomeMessage(firstName), ...currentMessages];
  }, [chatHistory, firstName, identityKey]);

  const lastBotMessage = useMemo(
    () => [...messages].reverse().find((message) => message.from === "bot"),
    [messages]
  );

  const openChat = () => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 120);
  };

  useEffect(() => () => {
    activeRequestRef.current?.controller.abort();
  }, []);

  useEffect(() => {
    if (!open) return;
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, loading, open]);

  const sendMessage = async (text = input) => {
    const cleanText = text.trim();
    if (activeRequestRef.current?.identityKey !== identityKey) {
      activeRequestRef.current?.controller.abort();
      activeRequestRef.current = null;
      requestInFlightRef.current = false;
    }
    if (!cleanText || loading || requestInFlightRef.current) return;

    const requestIdentity = identityKey;
    const requestController = new AbortController();
    requestInFlightRef.current = true;
    activeRequestRef.current = {
      controller: requestController,
      identityKey: requestIdentity,
    };

    const userMessage = {
      id: createMessageId("user"),
      from: "user",
      text: cleanText,
    };

    updateMessages((current) => [...current, userMessage]);
    setInputState({ identityKey: requestIdentity, value: "" });
    setRequestUiState({ identityKey: requestIdentity, loading: true });

    try {
      const [{ data }] = await Promise.all([
        api.post("/chatbot/mensaje", {
          mensaje: cleanText,
          context: safeContext,
          conversation: safeConversation,
        }, { signal: requestController.signal }),
        wait(MIN_RESPONSE_DELAY_MS),
      ]);
      if (activeRequestRef.current?.identityKey !== requestIdentity) return;

      const nextConversation = createConversationMemory(requestIdentity, data.conversation);
      setConversationMemory(nextConversation);
      const responseQuickActions = normalizeQuickActions(data.quickActions);
      const botMessage = {
        id: createMessageId("bot"),
        from: "bot",
        text: data.answer,
        intent: data.intent,
        title: data.title,
        recognized: data.recognized,
        disclaimer: data.disclaimer,
        suggestions: data.suggestions || [],
        quickActions: responseQuickActions,
        usesQuickActions: responseQuickActions.length > 0,
        quickActionsContextKey: currentContextKey,
        quickActionsGuide: data.conversation?.activeGuide || null,
        guideProgress: data.conversation?.activeGuide
          ? {
              currentStep: data.conversation.currentStep,
              totalSteps: data.conversation.totalSteps,
            }
          : null,
      };
      updateMessages((current) => [...current, botMessage]);
    } catch (error) {
      if (
        error?.code === "ERR_CANCELED"
        || activeRequestRef.current?.identityKey !== requestIdentity
      ) return;
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
      if (activeRequestRef.current?.controller === requestController) {
        activeRequestRef.current = null;
        requestInFlightRef.current = false;
        setRequestUiState({ identityKey: requestIdentity, loading: false });
        setTimeout(() => inputRef.current?.focus(), 80);
      }
    }
  };

  const handleQuickAction = (action) => {
    if (loading) return;
    if (action.type === "message") {
      sendMessage(action.message);
      return;
    }

    const destination = resolveQuickActionTarget(action, location, safeContext);
    if (!destination) return;
    const navigationKey = `${action.id}|${destination}`;
    if (lastNavigationRef.current === navigationKey) return;
    lastNavigationRef.current = navigationKey;
    navigate(destination);
    window.setTimeout(() => {
      if (lastNavigationRef.current === navigationKey) lastNavigationRef.current = null;
    }, 600);
  };

  const sendFeedback = async (helpful) => {
    if (!lastBotMessage || feedbackSent[lastBotMessage.id]) return;
    setFeedbackState((current) => ({
      identityKey,
      sent: {
        ...(current.identityKey === identityKey ? current.sent : {}),
        [lastBotMessage.id]: true,
      },
    }));

    try {
      await api.post("/chatbot/feedback", {
        helpful,
        intent: lastBotMessage.intent,
      });
    } catch {
      setFeedbackState((current) => ({
        identityKey,
        sent: {
          ...(current.identityKey === identityKey ? current.sent : {}),
          [lastBotMessage.id]: false,
        },
      }));
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
            {messages.map((message) => {
              const quickActions = visibleQuickActions(
                message,
                currentContextKey,
                safeConversation.activeGuide
              );
              const legacySuggestions = message.usesQuickActions
                ? []
                : (message.suggestions || []).slice(0, 4);

              return (
                <article
                  key={message.id}
                  className={`chatbot-message ${message.from === "user" ? "is-user" : "is-bot"}`}
                >
                  {message.title && <strong>{message.title}</strong>}
                  {message.guideProgress && (
                    <span className="chatbot-step-progress">
                      Paso {message.guideProgress.currentStep} de {message.guideProgress.totalSteps}
                    </span>
                  )}
                  <p>{message.text}</p>
                  {message.disclaimer && <small>{message.disclaimer}</small>}
                  {(quickActions.length > 0 || legacySuggestions.length > 0) && (
                    <div className="chatbot-suggestions">
                      {quickActions.map((action) => (
                        <button
                          key={action.id}
                          type="button"
                          disabled={loading}
                          aria-label={action.label}
                          onClick={() => handleQuickAction(action)}
                        >
                          {action.label}
                        </button>
                      ))}
                      {legacySuggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          disabled={loading}
                          onClick={() => sendMessage(suggestion)}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}

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
              onChange={(event) => setInputState({
                identityKey,
                value: event.target.value,
              })}
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
