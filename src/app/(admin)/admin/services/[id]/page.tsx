import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { ServiceDetailClient } from "./ServiceDetailClient";
import type { ServiceRecord, ProfileServiceRole, ServiceSectionOverride, ClientProfile } from "@/types";
import type { ServiceField } from "@/components/shared/DynamicServiceForm";

export const dynamic = "force-dynamic";

export type ServiceDoc = {
  id: string;
  file_name: string;
  file_path: string;
  verification_status: string;
  uploaded_at: string;
  client_profile_id: string | null;
  document_types: { name: string; category: string } | null;
};

export type ServiceWithTemplate = ServiceRecord & {
  service_templates: {
    id: string;
    name: string;
    description: string | null;
    service_fields: ServiceField[] | null;
  } | null;
};

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session || session.user.role !== "admin") redirect("/login");

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  const [serviceRes, rolesRes, overridesRes, docsRes, profilesRes] = await Promise.all([
    supabase
      .from("services")
      .select(`*, service_templates(id, name, description, service_fields)`)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .eq("is_deleted", false)
      .maybeSingle(),

    supabase
      .from("profile_service_roles")
      .select(`
        *,
        client_profiles(
          id, full_name, email, phone, is_representative, record_type,
          due_diligence_level, user_id,
          client_profile_kyc(completion_status, kyc_journey_completed)
        )
      `)
      .eq("service_id", id)
      .eq("tenant_id", tenantId),

    supabase
      .from("service_section_overrides")
      .select("*")
      .eq("service_id", id)
      .eq("tenant_id", tenantId),

    supabase
      .from("documents")
      .select(`
        id, file_name, file_path, verification_status, uploaded_at,
        client_profile_id,
        document_types(name, category)
      `)
      .eq("service_id", id)
      .eq("is_active", true),

    // All profiles for "Add profile" dialog
    supabase
      .from("client_profiles")
      .select("id, full_name, email, record_type, is_representative, due_diligence_level")
      .eq("tenant_id", tenantId)
      .eq("is_deleted", false)
      .order("full_name"),
  ]);

  if (!serviceRes.data) notFound();

  return (
    <div>
      <ServiceDetailClient
        service={serviceRes.data as unknown as ServiceWithTemplate}
        roles={(rolesRes.data ?? []) as unknown as ProfileServiceRole[]}
        overrides={(overridesRes.data ?? []) as unknown as ServiceSectionOverride[]}
        documents={(docsRes.data ?? []) as unknown as ServiceDoc[]}
        allProfiles={(profilesRes.data ?? []) as unknown as ClientProfile[]}
      />
    </div>
  );
}
