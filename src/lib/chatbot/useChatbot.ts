"use client";

// B-128 — Shared chatbot state machine for the client + admin
// widgets. Owns the transcript, in-flight state, and the fetch wrapper.
// Both widgets render the same panel UI on top of this hook; only the
// audience differs.

import { useCallback, useRef, useState } from "react";

export type ChatRole = "user" | "assistant";

export interface ChatKeywordMatch {
  id: string;
  title: string;
  category: string;
  content: string;
  rank: number;
}

export interface ChatSource {
  id: string;
  title: string;
  category: string;
}

export type ChatMessage =
  | { role: "user"; text: string }
  | {
      role: "assistant";
      mode: "keyword";
      matches: ChatKeywordMatch[];
    }
  | {
      role: "assistant";
      mode: "llm";
      text: string;
      sources: ChatSource[];
    }
  | { role: "assistant"; mode: "error"; text: string };

interface AskResponse {
  mode: "keyword" | "llm" | "error";
  matches?: ChatKeywordMatch[];
  answer?: string;
  candidates?: ChatSource[];
  message?: string;
}

export function useChatbot(audience: "admin" | "client") {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  // B-128 Batch 5 — short debounce window so rapid double-clicks /
  // double-Enter doesn't fire two requests for the same question.
  const lastSendAtRef = useRef<number>(0);

  const ask = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed) return;
      const now = Date.now();
      if (now - lastSendAtRef.current < 300) return; // debounced
      lastSendAtRef.current = now;
      if (loading) return;

      setMessages((m) => [...m, { role: "user", text: trimmed }]);
      setLoading(true);
      try {
        const res = await fetch("/api/chatbot/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmed, audience }),
        });
        const data = (await res.json()) as AskResponse;
        if (data.mode === "keyword" && data.matches) {
          setMessages((m) => [
            ...m,
            { role: "assistant", mode: "keyword", matches: data.matches! },
          ]);
        } else if (data.mode === "llm" && typeof data.answer === "string") {
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              mode: "llm",
              text: data.answer!,
              sources: data.candidates ?? [],
            },
          ]);
        } else {
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              mode: "error",
              text:
                data.message ??
                "The assistant is unavailable right now — try again in a moment.",
            },
          ]);
        }
      } catch (err) {
        // B-128 Batch 5 — quiet console log for failed fetches (no toast,
        // no telemetry yet). User sees the error bubble below.
        console.error("[chatbot] fetch failed:", err);
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            mode: "error",
            text:
              "The assistant is unavailable right now — try again in a moment.",
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [audience, loading],
  );

  const reset = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, loading, ask, reset };
}
