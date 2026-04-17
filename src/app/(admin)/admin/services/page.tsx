import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { ServicesPageClient } from "./ServicesPageClient";
import type { ServiceRecord } from "@/types";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const session = await auth();
  if (!session || session.user.role !== "admin") redirect("/login");

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  const { data: services } = await supabase
    .from("services")
    .select(`
      *,
      service_templates(name, description),
      profile_service_roles(
        id, role, can_manage,
        client_profiles(id, full_name, email, is_representative)
      )
    `)
    .eq("tenant_id", tenantId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  return (
    <div>
      <ServicesPageClient services={(services ?? []) as unknown as ServiceRecord[]} />
    </div>
  );
}
