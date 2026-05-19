// B-129 — Tenant brand resolution.
//
// Reads brand fields from tenants.settings JSON, with defaults for any
// missing keys. The brand is stamped onto session.user.tenantBrand at
// NextAuth `authorize()` time, so every server + client surface can
// read it without a per-render DB hit. Mirrors the B-127 pattern for
// adminPermissions.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface TenantBrand {
  display_name: string;
  portal_name: string;
  country: string;
  support_email: string;
  logo_url: string | null;
  footer_text: string;
  primary_color: string;
}

export const TENANT_BRAND_DEFAULTS: TenantBrand = {
  display_name: "Untitled",
  portal_name: "Client Portal",
  country: "",
  support_email: "",
  logo_url: null,
  footer_text: "",
  primary_color: "#1e3a8a",
};

/**
 * Resolve the tenant brand from the `tenants.settings` JSON column.
 * Falls back to defaults for any missing keys. Server-side use only.
 */
export async function getTenantBrand(
  supabase: SupabaseClient,
  tenantId: string
): Promise<TenantBrand> {
  const { data, error } = await supabase
    .from("tenants")
    .select("settings")
    .eq("id", tenantId)
    .maybeSingle();
  if (error || !data) return TENANT_BRAND_DEFAULTS;
  const s = (data.settings ?? {}) as Partial<TenantBrand>;
  return { ...TENANT_BRAND_DEFAULTS, ...s };
}

/**
 * Format a footer_text template with {portal_name} / {country}
 * placeholders. Simple string replace — no full templating engine
 * needed.
 */
export function formatFooter(brand: TenantBrand): string {
  return brand.footer_text
    .replace(/\{portal_name\}/g, brand.portal_name)
    .replace(/\{country\}/g, brand.country);
}
