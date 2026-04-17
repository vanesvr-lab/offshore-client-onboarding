import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { createAdminClient } from "./supabase/admin";
import { DEFAULT_TENANT_ID } from "./tenant";

export const { auth, handlers, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { type: "email" },
        password: { type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const supabase = createAdminClient();

        // Try new users table first, fall back to old profiles table
        // (profiles still works until SQL migration is run)
        let user: { id: string; full_name: string; email: string; password_hash: string; role?: string; is_active?: boolean; tenant_id?: string } | null = null;

        const { data: newUser } = await supabase
          .from("users")
          .select("id, full_name, email, password_hash, role, is_active, tenant_id")
          .eq("email", credentials.email as string)
          .eq("is_active", true)
          .maybeSingle();

        if (newUser) {
          user = newUser;
        } else {
          // Fallback: old profiles table (pre-migration)
          const { data: oldProfile } = await supabase
            .from("profiles")
            .select("id, full_name, email, password_hash, is_deleted")
            .eq("email", credentials.email as string)
            .eq("is_deleted", false)
            .maybeSingle();
          if (oldProfile) {
            // Derive role from admin_users
            const { data: adminRec } = await supabase
              .from("admin_users")
              .select("id")
              .eq("user_id", oldProfile.id)
              .maybeSingle();
            user = {
              ...oldProfile,
              full_name: oldProfile.full_name ?? "",
              role: adminRec ? "admin" : "user",
              is_active: true,
              tenant_id: undefined,
            };
          }
        }

        if (!user?.password_hash) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.password_hash
        );
        if (!valid) return null;

        // For non-admin users, find their client_profile
        let clientProfileId: string | null = null;
        let is_primary = true;
        if (user.role !== "admin") {
          const { data: profile } = await supabase
            .from("client_profiles")
            .select("id")
            .eq("user_id", user.id)
            .eq("is_deleted", false)
            .maybeSingle();
          if (profile) {
            clientProfileId = profile.id;
            // Check if they can_manage any service (primary-like behavior)
            const { count } = await supabase
              .from("profile_service_roles")
              .select("id", { count: "exact", head: true })
              .eq("client_profile_id", profile.id)
              .eq("can_manage", true);
            is_primary = (count ?? 0) > 0;
          }
        }

        return {
          id: user.id,
          email: user.email,
          name: user.full_name,
          role: user.role === "admin" ? "admin" : "client",
          is_primary,
          clientProfileId,
          tenantId: user.tenant_id ?? DEFAULT_TENANT_ID,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: string }).role;
        token.is_primary = (user as { is_primary: boolean }).is_primary ?? true;
        token.clientProfileId = (user as { clientProfileId: string | null }).clientProfileId ?? null;
        token.tenantId = (user as { tenantId: string }).tenantId ?? DEFAULT_TENANT_ID;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as string;
      session.user.is_primary = (token.is_primary as boolean) ?? true;
      session.user.clientProfileId = (token.clientProfileId as string | null) ?? null;
      session.user.tenantId = (token.tenantId as string) ?? DEFAULT_TENANT_ID;
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours
  },
});
