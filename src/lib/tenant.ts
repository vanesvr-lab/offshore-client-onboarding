/**
 * Multi-tenancy foundation.
 *
 * Single tenant today; brand resolved via getTenantBrand. See
 * src/lib/tenant-brand.ts. Every tenant-owned query should include:
 *   .eq("tenant_id", getTenantId())
 *
 * Future: resolve tenant from session JWT, subdomain, or header.
 */

/** Default tenant UUID — must match the seed in 003-phase1-schema.sql */
export const DEFAULT_TENANT_ID = "a1b2c3d4-0000-4000-8000-000000000001";

/**
 * Returns the tenant ID for the current context.
 * For now, always returns the default.
 * Future: extract from session.user.tenantId or request headers.
 */
export function getTenantId(_session?: { user?: { tenantId?: string } } | null): string {
  return _session?.user?.tenantId ?? DEFAULT_TENANT_ID;
}
