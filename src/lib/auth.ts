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

        // Fetch profile — never expose password_hash beyond this function
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, full_name, email, password_hash")
          .eq("email", credentials.email as string)
          .maybeSingle();

        if (!profile?.password_hash) return null;
        // Soft-deleted accounts cannot log in (no hint given to user)
        if ((profile as unknown as { is_deleted?: boolean }).is_deleted) return null;

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

        return {
          id: profile.id,
          email: profile.email,
          name: profile.full_name,
          role: adminRecord ? "admin" : "client",
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: string }).role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as string;
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
