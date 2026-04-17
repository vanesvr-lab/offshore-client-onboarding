import { DefaultSession } from "next-auth";

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
    } & DefaultSession["user"];
  }
}
