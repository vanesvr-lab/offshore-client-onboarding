import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { ClientServiceDetailClient } from "./ClientServiceDetailClient";
import type { ServiceSectionOverride } from "@/types";
import type { ServiceField } from "@/components/shared/DynamicServiceForm";

export const dynamic = "force-dynamic";

export type ClientServiceDoc = {
  id: string;
  file_name: string;
  verification_status: string;
  uploaded_at: string;
  document_types: { name: string; category: string } | null;
};

export type ClientServiceRecord = {
  id: string;
  status: string;
  service_details: Record<string, unknown>;
  service_templates: {
    id: string;
    name: string;
    description: string | null;
    service_fields: ServiceField[] | null;
  } | null;
};

export default async function ClientServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session) redirect("/login");

  const clientProfileId = session.user.clientProfileId;
  if (!clientProfileId) redirect("/dashboard");

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  // Verify the client can manage this service (may have multiple roles)
  const { data: roleRows } = await supabase
    .from("profile_service_roles")
    .select("id, role")
    .eq("service_id", id)
    .eq("client_profile_id", clientProfileId)
    .eq("can_manage", true)
    .eq("tenant_id", tenantId)
    .limit(1);

  const roleCheck = roleRows?.[0] ?? null;
  if (!roleCheck) notFound(); // no access

  const [serviceRes, docsRes, overridesRes] = await Promise.all([
    supabase
      .from("services")
      .select(`
        id, status, service_details,
        service_templates(id, name, description, service_fields)
      `)
      .eq("id", id)
      .eq("is_deleted", false)
      .maybeSingle(),

    // Docs for this service (all profiles)
    supabase
      .from("documents")
      .select("id, file_name, verification_status, uploaded_at, document_types(name, category)")
      .eq("service_id", id)
      .eq("is_active", true),

    // Section overrides for visible admin notes
    supabase
      .from("service_section_overrides")
      .select("section_key, override_status, admin_note")
      .eq("service_id", id)
      .eq("tenant_id", tenantId),
  ]);

  if (!serviceRes.data) notFound();

  return (
    <ClientServiceDetailClient
      service={serviceRes.data as unknown as ClientServiceRecord}
      documents={(docsRes.data ?? []) as unknown as ClientServiceDoc[]}
      overrides={(overridesRes.data ?? []) as unknown as ServiceSectionOverride[]}
      myRole={roleCheck.role}
      clientProfileId={clientProfileId}
    />
  );
}
