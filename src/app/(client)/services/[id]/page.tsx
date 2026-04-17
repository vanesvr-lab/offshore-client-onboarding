import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { ClientServiceDetailClient } from "./ClientServiceDetailClient";
import type { ServiceSectionOverride, DueDiligenceRequirement, DocumentType } from "@/types";
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

export type ServicePerson = {
  id: string;
  role: string;
  shareholding_percentage: number | null;
  can_manage: boolean;
  invite_sent_at: string | null;
  client_profiles: {
    id: string;
    full_name: string;
    email: string | null;
    due_diligence_level: string;
    client_profile_kyc: Record<string, unknown> | null;
  } | null;
};

export default async function ClientServiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: { wizardStep?: string };
}) {
  const { id } = await params;
  const autoWizardStep =
    searchParams.wizardStep !== undefined ? parseInt(searchParams.wizardStep, 10) : undefined;
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

  const [serviceRes, docsRes, overridesRes, personsRes, requirementsRes, documentTypesRes] = await Promise.all([
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

    // Persons linked to this service
    supabase
      .from("profile_service_roles")
      .select(`
        id, role, shareholding_percentage, can_manage, invite_sent_at,
        client_profiles!inner(
          id, full_name, email, due_diligence_level,
          client_profile_kyc(*)
        )
      `)
      .eq("service_id", id)
      .eq("tenant_id", tenantId),

    // DD requirements for KYC wizards
    supabase
      .from("due_diligence_requirements")
      .select("*, document_types(id, name)")
      .eq("tenant_id", tenantId)
      .order("sort_order"),

    // Document types
    supabase
      .from("document_types")
      .select("*")
      .eq("tenant_id", tenantId),
  ]);

  if (!serviceRes.data) notFound();

  return (
    <ClientServiceDetailClient
      service={serviceRes.data as unknown as ClientServiceRecord}
      documents={(docsRes.data ?? []) as unknown as ClientServiceDoc[]}
      overrides={(overridesRes.data ?? []) as unknown as ServiceSectionOverride[]}
      persons={(personsRes.data ?? []) as unknown as ServicePerson[]}
      requirements={(requirementsRes.data ?? []) as unknown as DueDiligenceRequirement[]}
      documentTypes={(documentTypesRes.data ?? []) as unknown as DocumentType[]}
      myRole={roleCheck.role}
      autoWizardStep={autoWizardStep}
    />
  );
}
