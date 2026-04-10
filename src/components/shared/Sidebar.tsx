"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  FileText,
  Home,
  PlusCircle,
  GitBranch,
  ShieldCheck,
  Files,
  BookOpen,
} from "lucide-react";

interface SidebarProps {
  role: "admin" | "client";
  userName?: string | null;
  hasApplications?: boolean;
}

const ADMIN_NAV = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard, exact: true },
  { label: "Clients", href: "/admin/clients", icon: Users, exact: false },
  { label: "Applications", href: "/admin/applications", icon: FileText, exact: true },
  { label: "Review Queue", href: "/admin/queue", icon: ClipboardList, exact: false },
];

const ADMIN_SETTINGS_NAV = [
  { label: "Templates", href: "/admin/settings/templates", icon: FileText, exact: false },
  { label: "Verification Rules", href: "/admin/settings/rules", icon: ShieldCheck, exact: false },
  { label: "Knowledge Base", href: "/admin/settings/knowledge-base", icon: BookOpen, exact: false },
  { label: "Workflow", href: "/admin/settings/workflow", icon: GitBranch, exact: false },
];

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
        active
          ? "bg-brand-accent text-brand-dark font-semibold"
          : "text-brand-muted hover:text-white hover:bg-white/5"
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0",
          active ? "text-brand-dark" : "text-brand-muted"
        )}
      />
      {label}
    </Link>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="pt-5 pb-1.5 px-3">
      <p className="text-brand-muted text-xs uppercase tracking-wider font-medium">
        {label}
      </p>
    </div>
  );
}

export function Sidebar({ role, userName, hasApplications }: SidebarProps) {
  const pathname = usePathname();

  function isActive(href: string, exact = false): boolean {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  // Detect if on a specific application page for contextual nav
  const adminAppMatch = pathname.match(/^\/admin\/applications\/([^/]+)/);
  const clientAppMatch = pathname.match(/^\/applications\/([^/]+)/);
  const contextAppId =
    role === "admin" ? adminAppMatch?.[1] : clientAppMatch?.[1];

  // Detect if on a specific client page for contextual nav
  const adminClientMatch = pathname.match(/^\/admin\/clients\/([^/]+)/);
  const contextClientId = role === "admin" ? adminClientMatch?.[1] : undefined;

  const clientNav = [
    { label: "Dashboard", href: "/dashboard", icon: Home, exact: true },
    { label: "New Application", href: "/apply", icon: PlusCircle, exact: false },
    ...(hasApplications
      ? [{ label: "My Applications", href: "/dashboard", icon: FileText, exact: false, activePaths: ["/applications"] }]
      : []),
  ];

  return (
    <aside className="w-[260px] shrink-0 flex flex-col bg-brand-dark min-h-screen sticky top-0 h-screen overflow-y-auto">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-white/10">
        <Link href={role === "admin" ? "/admin/dashboard" : "/dashboard"}>
          <div className="text-white font-semibold text-[14px] leading-snug">
            Mauritius Offshore
            <br />
            Client Portal
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {role === "admin" && (
          <>
            {ADMIN_NAV.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActive(item.href, item.exact)}
              />
            ))}

            <div className="border-t border-white/10 my-3" />
            <SectionHeader label="Settings" />
            {ADMIN_SETTINGS_NAV.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActive(item.href, item.exact)}
              />
            ))}

            {/* Contextual: on a client page */}
            {contextClientId && (
              <>
                <div className="border-t border-white/10 my-3" />
                <SectionHeader label="Client" />
                <NavItem
                  href={`/admin/clients/${contextClientId}`}
                  label="Overview"
                  icon={Users}
                  active={pathname === `/admin/clients/${contextClientId}`}
                />
                <NavItem
                  href={`/admin/clients/${contextClientId}/documents`}
                  label="Documents"
                  icon={Files}
                  active={pathname.startsWith(`/admin/clients/${contextClientId}/documents`)}
                />
              </>
            )}

            {/* Contextual: on an application page */}
            {contextAppId && (
              <>
                <div className="border-t border-white/10 my-3" />
                <SectionHeader label="Application" />
                <NavItem
                  href={`/admin/applications/${contextAppId}`}
                  label="Details"
                  icon={FileText}
                  active={
                    pathname === `/admin/applications/${contextAppId}` ||
                    (pathname.includes(`/admin/applications/${contextAppId}`) &&
                      !pathname.includes("/files"))
                  }
                />
                <NavItem
                  href={`/admin/applications/${contextAppId}/files`}
                  label="Files"
                  icon={Files}
                  active={pathname === `/admin/applications/${contextAppId}/files`}
                />
              </>
            )}
          </>
        )}

        {role === "client" && (
          <>
            {clientNav.map((item) => {
              const activeByPath =
                "activePaths" in item && item.activePaths
                  ? item.activePaths.some((p) => pathname.startsWith(p))
                  : false;
              return (
                <NavItem
                  key={item.href + item.label}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  active={activeByPath || isActive(item.href, item.exact)}
                />
              );
            })}

            {contextAppId && (
              <>
                <div className="border-t border-white/10 my-3" />
                <SectionHeader label="Application" />
                <NavItem
                  href={`/applications/${contextAppId}`}
                  label="Status"
                  icon={FileText}
                  active={pathname === `/applications/${contextAppId}`}
                />
                <NavItem
                  href={`/applications/${contextAppId}/files`}
                  label="Files"
                  icon={Files}
                  active={pathname === `/applications/${contextAppId}/files`}
                />
              </>
            )}
          </>
        )}
      </nav>

      {/* User info at bottom */}
      <div className="border-t border-white/10 px-5 py-4">
        {userName && (
          <p className="text-white text-sm font-medium truncate">{userName}</p>
        )}
        <p className="text-brand-muted text-xs mt-0.5">
          {role === "admin" ? "Administrator" : "Client"}
        </p>
      </div>
    </aside>
  );
}
