// B-101 Batch 6 — Floating AI Assistant widget for the client portal.
// B-128 — wired to /api/chatbot/ask with audience='client'. The panel
// + state machine are shared with the admin widget via
// `<ChatbotPanel>` + `useChatbot`.

"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { MessageCircle, X } from "lucide-react";
import { ChatbotPanel } from "./ChatbotPanel";
import { useChatbot } from "@/lib/chatbot/useChatbot";
import { TENANT_BRAND_DEFAULTS } from "@/lib/tenant-brand";

export function FloatingAssistantWidget() {
  const { data: session } = useSession();
  const brand = session?.user.tenantBrand ?? TENANT_BRAND_DEFAULTS;
  const [open, setOpen] = useState(false);
  const chat = useChatbot("client");
  const title = `${brand.display_name} Assistant`;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {open && (
        <div className="mb-3">
          <ChatbotPanel
            title={title}
            emptyState={
              <>
                Hi! Ask me how to do something in the portal, where to find a
                page, or what a term means.
                <div className="mt-2 space-y-0.5 text-gray-400 italic">
                  <div>e.g. <span className="text-gray-600">&ldquo;How do I upload a document?&rdquo;</span></div>
                  <div>e.g. <span className="text-gray-600">&ldquo;What does my application status mean?&rdquo;</span></div>
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
        aria-label={open ? `Close ${title}` : `Open ${title}`}
        title={open ? undefined : "Need help? Ask the assistant"}
        className="h-14 w-14 rounded-full bg-brand-navy text-white shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </div>
  );
}
