"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Menu } from "lucide-react";
import { portalName } from "@/lib/portal-name";

interface HeaderProps {
  userName?: string | null;
  /** B-103 — admin/client avatar shown next to the name in the top bar.
   *  Falls back to an initials circle when null. Wired in by both
   *  `(admin)/layout.tsx` and `(client)/layout.tsx`. */
  avatarUrl?: string | null;
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

export function Header({ userName, avatarUrl, variant = "admin", onOpenMobileNav }: HeaderProps) {
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
          {/* B-101 Batch 5 — role-based portal name. */}
          {portalName(variant === "admin")}
        </p>
        <p className="hidden sm:block text-brand-muted text-xs mt-0.5 truncate">
          The intelligent portal for client due diligence and compliance
        </p>
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        {/* B-103 — unified avatar treatment for admin + client variants:
            avatar image when `avatarUrl` is set, initials fallback when not. */}
        {userName && (
          <div className="flex items-center gap-2">
            <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-blue-500 flex items-center justify-center">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt={userName}
                  width={32}
                  height={32}
                  className="h-8 w-8 object-cover"
                  unoptimized
                />
              ) : (
                <span className="text-white text-xs font-semibold">{getInitials(userName)}</span>
              )}
            </div>
            <span className="text-white text-sm hidden sm:inline">{userName}</span>
          </div>
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
