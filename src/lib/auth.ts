import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { createAdminClient } from "./supabase/admin";

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

        // Fetch profile — only active (non-deleted) accounts can log in
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, full_name, email, password_hash, is_deleted")
          .eq("email", credentials.email as string)
          .eq("is_deleted", false)
          .maybeSingle();

        if (!profile?.password_hash) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          profile.password_hash
        );
        if (!valid) return null;

        // Determine role from table membership
        const { data: adminRecord } = await supabase
          .from("admin_users")
          .select("id")
          .eq("user_id", profile.id)
          .maybeSingle();

        // For client logins, check if linked to a non-primary kyc_record
        let is_primary = true;
        let kycRecordId: string | null = null;
        if (!adminRecord) {
          const { data: kycRecord } = await supabase
            .from("kyc_records")
            .select("id, is_primary")
            .eq("profile_id", profile.id)
            .maybeSingle();
          if (kycRecord) {
            kycRecordId = kycRecord.id;
            is_primary = kycRecord.is_primary ?? true;
          }
        }

        return {
          id: profile.id,
          email: profile.email,
          name: profile.full_name,
          role: adminRecord ? "admin" : "client",
          is_primary,
          kycRecordId,
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
        token.kycRecordId = (user as { kycRecordId: string | null }).kycRecordId ?? null;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as string;
      session.user.is_primary = (token.is_primary as boolean) ?? true;
      session.user.kycRecordId = (token.kycRecordId as string | null) ?? null;
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
