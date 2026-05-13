// B-101 Batch 4 — admin account settings page.
//
// Server component shell. Loads the current admin's user row and hands
// off to AccountSettingsClient which owns the three-card form.

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AccountSettingsClient } from "./AccountSettingsClient";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "admin") redirect("/dashboard");

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("id, full_name, email, avatar_url")
    .eq("id", session.user.id)
    .maybeSingle();

  if (!user) redirect("/admin/dashboard");

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold text-brand-navy mb-6">Account</h1>
      <AccountSettingsClient
        initialUser={{
          id: user.id,
          full_name: user.full_name ?? "",
          email: user.email ?? "",
          avatar_url: user.avatar_url ?? null,
        }}
      />
    </div>
  );
}
