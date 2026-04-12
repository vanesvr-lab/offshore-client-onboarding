"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

interface NavbarProps {
  role: "client" | "admin";
  userName?: string | null;
}

export function Navbar({ role, userName }: NavbarProps) {
  const router = useRouter();

  async function handleSignOut() {
    await signOut({ redirect: false });
    router.push("/login");
  }

  return (
    <nav className="border-b bg-brand-navy">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href={role === "admin" ? "/admin/dashboard" : "/dashboard"}>
            <div className="text-white">
              <div className="text-lg font-semibold">Mauritius Offshore Client Portal</div>
              <div className="text-xs text-brand-light">The intelligent portal for client due diligence and compliance</div>
            </div>
          </Link>
          {role === "admin" && (
            <div className="flex gap-4">
              <Link href="/admin/dashboard" className="text-sm text-brand-light hover:text-white transition-colors">Dashboard</Link>
              <Link href="/admin/clients" className="text-sm text-brand-light hover:text-white transition-colors">Clients</Link>
              <Link href="/admin/queue" className="text-sm text-brand-light hover:text-white transition-colors">Review Queue</Link>
              <Link href="/admin/settings/templates" className="text-sm text-brand-light hover:text-white transition-colors">Settings</Link>
            </div>
          )}
          {role === "client" && (
            <div className="flex gap-4">
              <Link href="/dashboard" className="text-sm text-brand-light hover:text-white transition-colors">Dashboard</Link>
              <Link href="/apply" className="text-sm text-brand-light hover:text-white transition-colors">New Application</Link>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          {userName && <span className="text-sm text-brand-light">{userName}</span>}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            className="border-brand-light text-brand-light hover:bg-brand-blue hover:text-white hover:border-brand-blue"
          >
            Sign out
          </Button>
        </div>
      </div>
    </nav>
  );
}
