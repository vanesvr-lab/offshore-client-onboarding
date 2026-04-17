import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { NewServiceWizard } from "./NewServiceWizard";
import type { ClientProfile } from "@/types";

export const dynamic = "force-dynamic";

export default async function NewServicePage() {
  const session = await auth();
  if (!session || session.user.role !== "admin") redirect("/login");

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  const [templatesRes, profilesRes] = await Promise.all([
    supabase
      .from("service_templates")
      .select("id, name, description, service_fields")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("client_profiles")
      .select("id, full_name, email, record_type, is_representative, due_diligence_level")
      .eq("tenant_id", tenantId)
      .eq("is_deleted", false)
      .order("full_name"),
  ]);

  return (
    <NewServiceWizard
      templates={(templatesRes.data ?? []) as unknown as Array<{
        id: string;
        name: string;
        description: string | null;
        service_fields: import("@/components/shared/DynamicServiceForm").ServiceField[];
      }>}
      profiles={(profilesRes.data ?? []) as unknown as ClientProfile[]}
    />
  );
}
