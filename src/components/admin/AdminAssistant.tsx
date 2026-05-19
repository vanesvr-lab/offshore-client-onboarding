// B-128 — Admin-side chatbot widget. Same shape as the client
// FloatingAssistantWidget but pointed at the admin audience. Mounted
// at the bottom of the admin layout so it appears on every admin page.

"use client";

import { useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { ChatbotPanel } from "@/components/shared/ChatbotPanel";
import { useChatbot } from "@/lib/chatbot/useChatbot";

export function AdminAssistant() {
  const [open, setOpen] = useState(false);
  const chat = useChatbot("admin");

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {open && (
        <div className="mb-3">
          <ChatbotPanel
            title="GWMS Admin Assistant"
            emptyState={
              <>
                Ask how to do something in the admin portal.
                <div className="mt-2 space-y-0.5 text-gray-400 italic">
                  <div>e.g. <span className="text-gray-600">&ldquo;How do I override a service stage?&rdquo;</span></div>
                  <div>e.g. <span className="text-gray-600">&ldquo;Where do I edit AI verification rules?&rdquo;</span></div>
                </div>
              </>
            }
            state={chat}
            onClose={() => setOpen(false)}
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close Admin Assistant" : "Open Admin Assistant"}
        title={open ? undefined : "Need help? Ask the admin assistant"}
        className="h-14 w-14 rounded-full bg-brand-navy text-white shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </div>
  );
}
