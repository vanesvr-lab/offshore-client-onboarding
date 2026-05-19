"use client";

// B-128 — Shared chatbot panel UI. Rendered inside a floating bubble
// container (client) or admin assistant container (admin). Same shape
// either way: header, transcript, input row. Audience is passed via
// the `useChatbot` hook outside this component — the panel itself is
// audience-agnostic.

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, RotateCcw, Loader2, ChevronDown } from "lucide-react";
import { MiniMarkdown } from "./MiniMarkdown";
import type { ChatMessage, useChatbot } from "@/lib/chatbot/useChatbot";

type ChatbotState = ReturnType<typeof useChatbot>;

interface Props {
  title: string;
  emptyState: React.ReactNode;
  state: ChatbotState;
  onClose: () => void;
}

export function ChatbotPanel({ title, emptyState, state, onClose }: Props) {
  const { messages, loading, ask, reset } = state;
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the transcript when new messages land.
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Esc closes the widget. Keep the listener while mounted.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus the textarea on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSend() {
    if (!input.trim() || loading) return;
    const q = input;
    setInput("");
    await ask(q);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <div
      className="w-[380px] max-w-[calc(100vw-3rem)] h-[500px] max-h-[calc(100vh-6rem)] rounded-2xl border bg-white shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-2"
      role="dialog"
      aria-label={title}
    >
      {/* Header */}
      <div className="bg-brand-navy text-white px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MessageCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm font-semibold truncate">{title}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={reset}
              aria-label="Reset transcript"
              title="Reset conversation"
              className="rounded-full p-1 hover:bg-white/10 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 hover:bg-white/10 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Transcript */}
      <div
        className="flex-1 px-3 py-3 overflow-y-auto bg-gray-50 space-y-3"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <div className="text-sm text-gray-500 px-2">{emptyState}</div>
        )}
        {messages.map((msg, idx) => (
          <MessageBubble key={idx} msg={msg} />
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border rounded-2xl rounded-tl-sm px-3 py-2 shadow-sm flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-pulse" style={{ animationDelay: "0ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-pulse" style={{ animationDelay: "150ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-pulse" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
        <div ref={transcriptEndRef} />
      </div>

      {/* Input row */}
      <div className="border-t bg-white px-3 py-3 flex items-end gap-2 shrink-0">
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          placeholder="Ask a question…"
          className="flex-1 resize-none rounded-lg border bg-white px-3 py-2 text-sm placeholder:text-gray-400 disabled:bg-gray-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand-navy/30 max-h-32"
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={loading || !input.trim()}
          aria-label="Send"
          className="rounded-full h-9 w-9 inline-flex items-center justify-center bg-brand-navy text-white shadow-sm hover:bg-brand-navy/90 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-brand-navy text-white px-3 py-2 text-sm shadow-sm whitespace-pre-wrap break-words">
          {msg.text}
        </div>
      </div>
    );
  }

  if (msg.mode === "error") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2 text-sm shadow-sm">
          {msg.text}
        </div>
      </div>
    );
  }

  if (msg.mode === "keyword") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[92%] space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-400">
            Found {msg.matches.length} {msg.matches.length === 1 ? "match" : "matches"}
          </div>
          {msg.matches.map((match) => (
            <KeywordMatchCard key={match.id} match={match} />
          ))}
        </div>
      </div>
    );
  }

  // LLM mode
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-2xl rounded-tl-sm bg-white border px-3 py-2 shadow-sm space-y-2">
        <MiniMarkdown content={msg.text} className="text-sm text-gray-700" />
        {msg.sources.length > 0 && <SourcesExpander sources={msg.sources} />}
      </div>
    </div>
  );
}

function KeywordMatchCard({
  match,
}: {
  match: { id: string; title: string; content: string };
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-2xl rounded-tl-sm bg-white border shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-start justify-between gap-2"
      >
        <span className="text-sm font-medium text-brand-navy">{match.title}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>
      {expanded && (
        <div className="border-t px-3 py-2">
          <MiniMarkdown content={match.content} className="text-sm text-gray-700" />
        </div>
      )}
    </div>
  );
}

function SourcesExpander({ sources }: { sources: Array<{ id: string; title: string }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t pt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] text-gray-500 hover:text-gray-700 inline-flex items-center gap-0.5"
      >
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
        {sources.length} {sources.length === 1 ? "source" : "sources"}
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5 text-[11px] text-gray-600">
          {sources.map((s) => (
            <li key={s.id}>· {s.title}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
