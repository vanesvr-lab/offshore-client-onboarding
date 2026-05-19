// B-129 Batch 7 — two-line header: tenant brand on line 1,
// "Powered by [Elarix logo] Elarix · tagline" on line 2.
//
// Used inside the authenticated layouts (Header / Sidebar / Navbar).
// Pre-auth surfaces (/login, /auth/set-password) intentionally don't
// render this — see authPageHeading() in src/lib/portal-name.ts.

"use client";

import { useSession } from "next-auth/react";
import { PLATFORM_BRAND } from "@/lib/platform-brand";
import { portalHeading } from "@/lib/portal-name";
import { TENANT_BRAND_DEFAULTS } from "@/lib/tenant-brand";

interface Props {
  isAdmin: boolean;
  /** If true, hides the tagline (for narrow sidebars). Logo + name
   *  still show. */
  compact?: boolean;
  /** Color variant. "light" = dark text on light bg (default).
   *  "dark" = light text on dark bg (Header / Sidebar / Navbar). */
  variant?: "light" | "dark";
}

export function BrandedHeader({ isAdmin, compact, variant = "light" }: Props) {
  const { data: session } = useSession();
  const brand = session?.user.tenantBrand ?? TENANT_BRAND_DEFAULTS;
  const heading = portalHeading(brand, isAdmin);

  const headingColor =
    variant === "dark" ? "text-white" : "text-gray-900";
  const subtleColor =
    variant === "dark" ? "text-brand-muted" : "text-gray-500";
  const labelColor =
    variant === "dark" ? "text-brand-muted/80" : "text-gray-400";
  const platformColor =
    variant === "dark" ? "text-white/80" : "text-gray-700";

  return (
    <div className="space-y-0.5 min-w-0">
      <h1 className={`text-base font-semibold leading-tight truncate ${headingColor}`}>
        {heading}
      </h1>
      <p className={`text-[11px] flex items-center gap-1.5 leading-tight ${subtleColor}`}>
        <span className={labelColor}>Powered by</span>
        <img
          src={PLATFORM_BRAND.logo_url}
          alt={PLATFORM_BRAND.name}
          className="h-4 w-4 object-contain shrink-0"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <span className={`font-medium ${platformColor}`}>{PLATFORM_BRAND.name}</span>
        {!compact && (
          <>
            <span className={`${labelColor} mx-0.5 hidden lg:inline`}>·</span>
            <span className={`${subtleColor} hidden lg:inline truncate`}>
              {PLATFORM_BRAND.tagline}
            </span>
          </>
        )}
      </p>
    </div>
  );
}
