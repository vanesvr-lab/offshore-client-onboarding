import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { SessionProvider } from "next-auth/react";

// B-101 Batch 5 — metadata title is generic since Next.js metadata can't
// switch per request without server logic. Role-aware portal names are
// applied at the UI layer via `portalName(isAdmin)`.
export const metadata: Metadata = {
  title: "Mauritius Offshore Portal",
  description: "Mauritius Offshore Portal — The intelligent portal for client due diligence and compliance",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <SessionProvider>
          {children}
        </SessionProvider>
        <Toaster />
      </body>
    </html>
  );
}
