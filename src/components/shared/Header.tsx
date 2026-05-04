"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Menu } from "lucide-react";

interface HeaderProps {
  userName?: string | null;
  variant?: "admin" | "client";
  onOpenMobileNav?: () => void;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function Header({ userName, variant = "admin", onOpenMobileNav }: HeaderProps) {
  const router = useRouter();

  async function handleSignOut() {
    await signOut({ redirect: false });
    router.push("/login");
  }

  return (
    <header className="h-14 shrink-0 bg-brand-dark border-b border-white/10 flex items-center px-4 sm:px-6 gap-2">
      {/* Mobile burger — only on client variant where the sidebar drawer exists */}
      {variant === "client" && onOpenMobileNav && (
        <button
          type="button"
          aria-label="Open navigation"
          onClick={onOpenMobileNav}
          className="md:hidden h-11 w-11 -ml-2 inline-flex items-center justify-center rounded text-white hover:bg-white/10 transition-colors"
        >
          <Menu className="h-6 w-6" />
        </button>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-white font-bold text-base sm:text-lg leading-none truncate">
          Mauritius Offshore Client Portal
        </p>
        <p className="hidden sm:block text-brand-muted text-xs mt-0.5 truncate">
          The intelligent portal for client due diligence and compliance
        </p>
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        {variant === "client" && userName ? (
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-semibold">{getInitials(userName)}</span>
            </div>
            <span className="text-white text-sm hidden sm:inline">{userName}</span>
          </div>
        ) : (
          userName && <span className="hidden sm:inline text-white text-sm">{userName}</span>
        )}
        <button
          onClick={handleSignOut}
          className="rounded border border-white/30 text-white text-sm px-3 sm:px-4 py-1.5 hover:bg-white/10 transition-colors"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
