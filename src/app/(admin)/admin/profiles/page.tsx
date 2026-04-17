import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { ProfilesPageClient } from "./ProfilesPageClient";
import type { ClientProfile } from "@/types";

export const dynamic = "force-dynamic";

export default async function ProfilesPage() {
  const session = await auth();
  if (!session || session.user.role !== "admin") redirect("/login");

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  const { data: profiles } = await supabase
    .from("client_profiles")
    .select(`
      *,
      client_profile_kyc(completion_status, kyc_journey_completed),
      profile_service_roles(
        id, role, can_manage,
        services(id, status, service_templates(name))
      ),
      users(email)
    `)
    .eq("tenant_id", tenantId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  return (
    <div>
      <ProfilesPageClient profiles={(profiles ?? []) as unknown as ClientProfile[]} />
    </div>
  );
}
