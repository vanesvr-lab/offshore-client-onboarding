// B-101 Batch 6 — Floating AI Assistant placeholder widget.
//
// UI-only — no backend wiring. Renders a circular button bottom-right
// of every authenticated page. Click opens a slide-in panel anchored to
// the same corner with a static welcome message and a disabled input
// row. State is local React state; resets per page load (fine for a
// placeholder).

"use client";

import { useState } from "react";
import { MessageCircle, X, Send } from "lucide-react";

export function FloatingAssistantWidget() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {open && (
        <div
          className="mb-3 w-80 max-w-[calc(100vw-3rem)] h-[28rem] rounded-2xl border bg-white shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-2"
          role="dialog"
          aria-label="AI Assistant"
        >
          {/* Header */}
          <div className="bg-brand-navy text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              <span className="text-sm font-semibold">AI Assistant</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded-full p-1 hover:bg-white/10 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body — single placeholder bot bubble */}
          <div className="flex-1 px-4 py-4 overflow-y-auto bg-gray-50">
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white border px-3 py-2 text-sm text-gray-700 shadow-sm">
              <p>Hi! I&rsquo;m here to help you fill out the form and answer questions about the onboarding process.</p>
              <p className="mt-2">
                AI assistance is coming soon &mdash; for now, please reach out
                to{" "}
                <a
                  href="mailto:support@elarix.io"
                  className="text-brand-navy underline"
                >
                  support@elarix.io
                </a>{" "}
                if you need help.
              </p>
            </div>
          </div>

          {/* Input row — disabled */}
          <div className="border-t bg-white px-3 py-3 flex items-end gap-2">
            <textarea
              disabled
              rows={1}
              placeholder="AI assistance coming soon…"
              className="flex-1 resize-none rounded-lg border bg-gray-50 px-3 py-2 text-sm text-gray-500 placeholder:text-gray-400 disabled:cursor-not-allowed focus:outline-none"
            />
            <button
              type="button"
              disabled
              aria-label="Send"
              className="rounded-full h-9 w-9 inline-flex items-center justify-center bg-gray-200 text-gray-400 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close AI Assistant" : "Open AI Assistant"}
        className="h-14 w-14 rounded-full bg-brand-navy text-white shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </div>
  );
}
