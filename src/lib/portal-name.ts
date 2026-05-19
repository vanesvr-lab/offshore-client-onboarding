// B-129 Batch 7 — Portal heading composed from tenant brand + role.
// The old "Mauritius Offshore" hardcoded prefix is removed.

import type { TenantBrand } from "@/lib/tenant-brand";

export function portalHeading(brand: TenantBrand, isAdmin: boolean): string {
  const role = isAdmin ? "Admin" : "Client";
  return `${brand.display_name} - ${role} Portal`;
}

/** Fallback for auth pages (login / set-password) where there's no
 *  session yet. Returns a generic string so the tenant identity is
 *  not leaked to unauthenticated visitors. */
export function authPageHeading(): string {
  return "Sign in";
}
