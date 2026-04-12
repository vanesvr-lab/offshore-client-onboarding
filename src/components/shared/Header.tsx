"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

interface HeaderProps {
  userName?: string | null;
}

export function Header({ userName }: HeaderProps) {
  const router = useRouter();

  async function handleSignOut() {
    await signOut({ redirect: false });
    router.push("/login");
  }

  return (
    <header className="h-14 shrink-0 bg-brand-dark border-b border-white/10 flex items-center px-6">
      <div className="flex-1">
        <p className="text-white font-bold text-lg leading-none">
          Mauritius Offshore Client Portal
        </p>
        <p className="text-brand-muted text-xs mt-0.5">
          The intelligent portal for client due diligence and compliance
        </p>
      </div>
      <div className="flex items-center gap-4">
        {userName && (
          <span className="text-white text-sm">{userName}</span>
        )}
        <button
          onClick={handleSignOut}
          className="rounded border border-white/30 text-white text-sm px-4 py-1.5 hover:bg-white/10 transition-colors"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
