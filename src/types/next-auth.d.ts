import { DefaultSession } from "next-auth";
import type { AdminPermissions } from "@/lib/admin-permissions";
import type { TenantBrand } from "@/lib/tenant-brand";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      /** true = full portal access; false = restricted non-primary view */
      is_primary: boolean;
      /** client_profiles.id linked to this login (non-null for client logins) */
      clientProfileId: string | null;
      /** Tenant UUID for multi-tenancy filtering */
      tenantId: string;
      /** B-127 — admin role + 10 permission flags. Null for client users. */
      adminPermissions: AdminPermissions | null;
      /** B-129 — tenant brand resolved from tenants.settings. */
      tenantBrand: TenantBrand;
    } & DefaultSession["user"];
  }
}
