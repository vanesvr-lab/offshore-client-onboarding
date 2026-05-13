"use client";

import { useState } from "react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { FloatingAssistantWidget } from "./FloatingAssistantWidget";

interface ClientShellProps {
  userName: string | null | undefined;
  /** B-103 — forwarded to the top Header so the avatar slot uses the
   *  uploaded image when available. */
  avatarUrl?: string | null;
  hasApplications: boolean;
  isPrimary: boolean;
  children: React.ReactNode;
}

export function ClientShell({ userName, avatarUrl, hasApplications, isPrimary, children }: ClientShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex flex-col min-h-screen bg-sky-50/30">
      <Header
        userName={userName}
        avatarUrl={avatarUrl}
        variant="client"
        onOpenMobileNav={() => setMobileNavOpen(true)}
      />
      <div className="flex flex-1 min-h-0">
        <Sidebar
          role="client"
          userName={userName}
          hasApplications={hasApplications}
          isPrimary={isPrimary}
          mobileOpen={mobileNavOpen}
          onMobileOpenChange={setMobileNavOpen}
        />
        <main className="flex-1 min-w-0 overflow-auto">
          <div className="p-4 md:p-8">{children}</div>
        </main>
      </div>
      {/* B-101 Batch 6 — placeholder AI assistant widget. UI-only; no backend wiring yet. */}
      <FloatingAssistantWidget />
    </div>
  );
}
