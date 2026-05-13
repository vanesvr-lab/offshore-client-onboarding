import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ClientShell } from "@/components/shared/ClientShell";
import { getTenantId } from "@/lib/tenant";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role === "admin") redirect("/admin/dashboard");

  const isPrimary = session.user.is_primary !== false;
  const tenantId = getTenantId(session);
  const supabase = createAdminClient();

  // Get client profile for display name
  let displayName = session.user.name;
  if (session.user.clientProfileId) {
    const { data: profile } = await supabase
      .from("client_profiles")
      .select("full_name")
      .eq("id", session.user.clientProfileId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (profile?.full_name) displayName = profile.full_name;
  }

  // B-103 — read avatar_url for the top Header's unified avatar slot.
  // Clients can't upload one yet (B-101 deferred the /account mirror),
  // so this is null for everyone today but the hookup is forward-
  // compatible for when client-side upload ships.
  const { data: userRow } = await supabase
    .from("users")
    .select("avatar_url")
    .eq("id", session.user.id)
    .maybeSingle();
  const avatarUrl = userRow?.avatar_url ?? null;

  // Fallback: try old client_users → clients path for backward compat
  let companyName = displayName;
  if (isPrimary) {
    const { data: clientUser } = await supabase
      .from("client_users")
      .select("client_id, clients(company_name)")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (clientUser) {
      const cn = (clientUser.clients as unknown as { company_name?: string } | null)?.company_name;
      if (cn) companyName = cn;
    }
  }

  // Check if client has any applications (for "My Applications" sidebar item)
  const { count: appCount } = isPrimary
    ? await supabase
        .from("profile_service_roles")
        .select("id", { count: "exact", head: true })
        .eq("client_profile_id", session.user.clientProfileId ?? "")
        .eq("can_manage", true)
    : { count: 0 };

  return (
    <ClientShell
      userName={companyName}
      avatarUrl={avatarUrl}
      hasApplications={(appCount ?? 0) > 0}
      isPrimary={isPrimary}
    >
      {children}
    </ClientShell>
  );
}
