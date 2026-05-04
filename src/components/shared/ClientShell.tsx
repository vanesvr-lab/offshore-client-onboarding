"use client";

import { useState } from "react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

interface ClientShellProps {
  userName: string | null | undefined;
  hasApplications: boolean;
  isPrimary: boolean;
  children: React.ReactNode;
}

export function ClientShell({ userName, hasApplications, isPrimary, children }: ClientShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex flex-col min-h-screen bg-sky-50/30">
      <Header
        userName={userName}
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
    </div>
  );
}
