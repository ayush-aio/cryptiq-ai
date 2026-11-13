import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Activity, ArrowUpRight, Check, ChevronDown, CircleHelp, Copy,
  FileText, Menu, MessageSquare, Plus, Search, Send, Settings2,
  Sparkles, Trash2, X, Zap, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";

const API_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const STORAGE_KEY = "cryptiq_conversations_v1";

const starters = [
  { icon: Activity, title: "Analyze Bitcoin", detail: "Explore BTC market data and momentum.", prompt: "Analyze Bitcoin using the latest available market data. Explain the key metrics and what they mean." },
  { icon: FileText, title: "Latest crypto news", detail: "Catch up on important market headlines.", prompt: "Find the latest important cryptocurrency news and summarize the key developments." },
  { icon: ArrowUpRight, title: "Compare assets", detail: "Compare two cryptocurrencies side by side.", prompt: "Compare Bitcoin and Ethereum using the latest market data available to you." },
  { icon: Search, title: "Explore a coin", detail: "Look up a cryptocurrency by symbol.", prompt: "Show me the available cryptocurrency list and explain how I can look up a specific coin." },
];

function makeChat() {
  return { id: crypto.randomUUID(), title: "New conversation", messages: [], updatedAt: Date.now() };
}

function loadChats() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) && value.length ? value : [makeChat()];
  } catch {
    return [makeChat()];
  }
}

function timeLabel(value) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function App() {
  const [initialChats] = useState(loadChats);
  const [chats, setChats] = useState(initialChats);
  const [activeId, setActiveId] = useState(initialChats[0]?.id);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [copied, setCopied] = useState("");
  const [apiStatus, setApiStatus] = useState("checking");
  const textareaRef = useRef(null);
  const bottomRef = useRef(null);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeId) || chats[0],
    [chats, activeId]
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((res) => { if (!res.ok) throw new Error(); setApiStatus("online"); })
      .catch(() => setApiStatus("offline"));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeChat?.messages, busy]);

  function patchChat(id, patch) {
    setChats((items) => items.map((chat) => chat.id === id ? { ...chat, ...patch, updatedAt: Date.now() } : chat));
  }

  function newChat() {
    const chat = makeChat();
    setChats((items) => [chat, ...items]);
    setActiveId(chat.id);
    setInput("");
    setMobileOpen(false);
    textareaRef.current?.focus();
  }

  function removeChat(id) {
    const remaining = chats.filter((chat) => chat.id !== id);
    if (!remaining.length) {
      const fresh = makeChat();
      setChats([fresh]);
      setActiveId(fresh.id);
    } else {
      setChats(remaining);
      if (activeId === id) setActiveId(remaining[0].id);
    }
  }

  function clearChat() {
    if (!activeChat || !window.confirm("Clear this conversation?")) return;
    patchChat(activeChat.id, { title: "New conversation", messages: [] });
  }

  async function copyMessage(message) {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(message);
      window.setTimeout(() => setCopied(""), 1300);
    } catch {
      setCopied("");
    }
  }

  async function sendMessage(value = input) {
    const text = value.trim();
    if (!text || busy || !activeChat) return;

    const chatId = activeChat.id;
    const userMessage = {
      id: crypto.randomUUID(), role: "user", content: text, createdAt: Date.now(),
    };
    const currentMessages = [...activeChat.messages, userMessage];
    const title = activeChat.messages.length === 0
      ? (text.length > 34 ? `${text.slice(0, 34)}…` : text)
      : activeChat.title;

    patchChat(chatId, { messages: currentMessages, title });
    setInput("");
    setBusy(true);

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, thread_id: chatId }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || `Request failed (${response.status})`);

      const assistantMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.response || "The agent returned an empty response.",
        createdAt: Date.now(),
      };
      setChats((items) => items.map((chat) => chat.id === chatId
        ? { ...chat, messages: [...chat.messages, assistantMessage], updatedAt: Date.now() }
        : chat));
      setApiStatus("online");
    } catch (error) {
      const errorMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        error: true,
        createdAt: Date.now(),
        content: `I couldn't reach the analysis service.\n\n${error.message}\n\nPlease check that the backend is deployed, its API keys are configured, and VITE_API_URL points to the backend URL.`,
      };
      setChats((items) => items.map((chat) => chat.id === chatId
        ? { ...chat, messages: [...chat.messages, errorMessage], updatedAt: Date.now() }
        : chat));
      setApiStatus("offline");
    } finally {
      setBusy(false);
      textareaRef.current?.focus();
    }
  }

  function onKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  const sidebar = (
    <aside className={`sidebar ${sidebarOpen ? "" : "sidebar--slim"}`}>
      <div className="brand-row">
        <div className="brand-mark"><Activity size={20} strokeWidth={2.5} /></div>
        {sidebarOpen && <div className="brand-copy"><b>CRYPT<span>IQ</span></b><small>MARKET INTELLIGENCE</small></div>}
        <button className="icon-btn collapse-btn" onClick={() => setSidebarOpen(!sidebarOpen)} title="Collapse sidebar">
          {sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
        </button>
      </div>

      <button className="new-chat" onClick={newChat}><Plus size={17} />{sidebarOpen && <span>New conversation</span>}</button>

      {sidebarOpen && <>
        <div className="side-label">WORKSPACE</div>
        <div className="nav-item nav-active"><MessageSquare size={16} /><span>AI Assistant</span><span className="nav-count">LIVE</span></div>
        <div className="side-label recent-label">RECENT CHATS</div>
        <div className="chat-list">
          {chats.map((chat) => (
            <div className={`chat-link ${chat.id === activeId ? "chat-link-active" : ""}`} key={chat.id}>
              <button className="chat-select" onClick={() => { setActiveId(chat.id); setMobileOpen(false); }}>
                <MessageSquare size={15} /><span>{chat.title}</span>
              </button>
              <button className="chat-delete" title="Delete conversation" onClick={() => removeChat(chat.id)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </>}

      <div className="sidebar-bottom">
        {sidebarOpen && <div className="plan-card">
          <div className="plan-icon"><Sparkles size={16} /></div>
          <div><b>Research workspace</b><span>LangGraph · OpenAI</span></div>
        </div>}
        <div className="profile-row">
          <div className="profile-avatar">C</div>
          {sidebarOpen && <div className="profile-copy"><b>CryptIQ Assistant</b><span>Personal workspace</span></div>}
          {sidebarOpen && <Settings2 size={16} className="profile-settings" />}
        </div>
      </div>
    </aside>
  );

  return (
    <div className="app-shell">
      {mobileOpen && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setMobileOpen(false)} />}
      <div className={`sidebar-wrap ${mobileOpen ? "sidebar-wrap-open" : ""}`}>{sidebar}</div>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-btn mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
            <div className="crumb"><span>Workspace</span><i>/</i><b>AI Assistant</b></div>
          </div>
          <div className="topbar-right">
            <div className={`connection ${apiStatus}`}><span className="connection-dot" />{apiStatus === "checking" ? "Connecting" : apiStatus === "online" ? "Agent online" : "Service unavailable"}</div>
            <div className="top-avatar"><Activity size={17} /></div>
          </div>
        </header>

        <section className="conversation-area">
          {activeChat?.messages.length === 0 ? (
            <div className="welcome">
              <div className="eyebrow"><span className="eyebrow-pulse" /> YOUR AI-POWERED CRYPTO RESEARCH DESK</div>
              <div className="hero-orb"><div className="orb-ring ring-one" /><div className="orb-ring ring-two" /><Activity size={34} /></div>
              <h1>Clarity in a market<br /><span>that never sleeps.</span></h1>
              <p className="welcome-subtitle">Research crypto markets, understand the latest data, and make sense of the headlines — through one intelligent conversation.</p>
              <div className="suggestion-head"><div><b>Start exploring</b><span>Choose a prompt or ask your own question</span></div><Sparkles size={17} /></div>
              <div className="starter-grid">
                {starters.map(({ icon: Icon, title, detail, prompt }) => (
                  <button className="starter-card" key={title} onClick={() => sendMessage(prompt)} disabled={busy}>
                    <div className="starter-icon"><Icon size={19} /></div>
                    <div className="starter-copy"><b>{title}</b><span>{detail}</span></div>
                    <ArrowUpRight className="starter-arrow" size={16} />
                  </button>
                ))}
              </div>
              <div className="trust-row"><span><Check size={13} /> Live tool-based research</span><span><Check size={13} /> News context</span><span><Check size={13} /> Conversation memory</span></div>
            </div>
          ) : (
            <div className="messages">
              <div className="messages-toolbar">
                <div><span className="section-kicker">YOUR SESSION</span><h2>{activeChat?.title}</h2></div>
                <button className="clear-btn" onClick={clearChat}><Trash2 size={14} /> Clear chat</button>
              </div>
              {activeChat?.messages.map((message) => (
                <article className={`message-row ${message.role === "user" ? "message-user" : ""}`} key={message.id}>
                  <div className={`message-avatar ${message.role === "user" ? "avatar-user" : "avatar-ai"}`}>{message.role === "user" ? "Y" : <Activity size={17} />}</div>
                  <div className="message-main">
                    <div className="message-meta"><b>{message.role === "user" ? "You" : "CryptIQ"}</b><time>{timeLabel(message.createdAt)}</time></div>
                    <div className={`message-bubble ${message.role === "user" ? "bubble-user" : "bubble-ai"} ${message.error ? "bubble-error" : ""}`}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                    </div>
                    {message.role === "assistant" && <button className="copy-btn" onClick={() => copyMessage(message.content)}>{copied === message.content ? <Check size={13} /> : <Copy size={13} />}{copied === message.content ? "Copied" : "Copy response"}</button>}
                  </div>
                </article>
              ))}
              {busy && <div className="message-row"><div className="message-avatar avatar-ai"><Activity size={17} /></div><div className="thinking"><span>CryptIQ is researching</span><div className="typing-dots"><i /><i /><i /></div></div></div>}
              <div ref={bottomRef} />
            </div>
          )}
        </section>

        <footer className="composer-wrap">
          <div className="composer">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about Bitcoin, Ethereum, market trends, or crypto news..."
              disabled={busy}
              aria-label="Message CryptIQ"
            />
            <button className="send-btn" onClick={() => sendMessage()} disabled={!input.trim() || busy} aria-label="Send message">
              {busy ? <span className="spinner" /> : <Send size={17} />}
            </button>
          </div>
          <div className="composer-caption"><span><Zap size={12} /> LangGraph agent · OpenAI</span><span>Enter to send <i>·</i> Shift + Enter for a new line</span></div>
          <p className="disclaimer"><CircleHelp size={12} /> AI-generated research can be inaccurate. Not financial advice.</p>
        </footer>
      </main>
    </div>
  );
}
