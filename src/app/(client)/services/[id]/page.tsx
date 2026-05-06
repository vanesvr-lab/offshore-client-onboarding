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
  mime_type: string | null;
  verification_status: string;
  verification_result: Record<string, unknown> | null;
  admin_status: string | null;
  /** B-033 — set when the AI prefill banner has been applied or skipped for this upload. */
  prefill_dismissed_at: string | null;
  uploaded_at: string;
  document_type_id: string | null;
  client_profile_id: string | null;
  document_types: { name: string; category: string } | null;
};

export type ClientServiceRecord = {
  id: string;
  status: string;
  service_number: string | null;
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
  invite_sent_by_name: string | null; // resolved sender name (from profiles join)
  // B-067 §6 — invite rate-limit state (3 per profile/service per 24h).
  invites_sent_count_24h?: number | null;
  invites_count_window_start?: string | null;
  client_profiles: {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    due_diligence_level: string;
    record_type: string | null;
    client_profile_kyc: Record<string, unknown> | null;
  } | null;
};

export default async function ClientServiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: { wizardStep?: string; startWizard?: string };
}) {
  const { id } = await params;
  const autoWizardStep =
    searchParams.wizardStep !== undefined ? parseInt(searchParams.wizardStep, 10) :
    searchParams.startWizard === "true" ? 0 :
    undefined;
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

  const [serviceRes, overridesRes, personsRes, requirementsRes, documentTypesRes] = await Promise.all([
    supabase
      .from("services")
      .select(`
        id, status, service_number, service_details,
        service_templates(id, name, description, service_fields)
      `)
      .eq("id", id)
      .eq("is_deleted", false)
      .maybeSingle(),

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
        id, role, shareholding_percentage, can_manage, invite_sent_at, invite_sent_by,
        invites_sent_count_24h, invites_count_window_start,
        client_profiles!inner(
          id, full_name, email, phone, due_diligence_level, record_type,
          client_profile_kyc(*)
        )
      `)
      .eq("service_id", id)
      .eq("tenant_id", tenantId),

    // DD requirements for KYC wizards
    supabase
      .from("due_diligence_requirements")
      .select("*, document_types(id, name, category, scope)")
      .eq("tenant_id", tenantId)
      .order("sort_order"),

    // Document types
    supabase
      .from("document_types")
      .select("*")
      .eq("tenant_id", tenantId),
  ]);

  if (!serviceRes.data) notFound();

  // Resolve invite sender names (invite_sent_by = user_id → profiles.full_name)
  const senderIds = (personsRes.data ?? [])
    .map((p) => (p as unknown as { invite_sent_by?: string | null }).invite_sent_by)
    .filter((uid): uid is string => !!uid);

  let senderNameMap: Map<string, string> = new Map();
  if (senderIds.length > 0) {
    const { data: senderProfiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", senderIds);
    senderNameMap = new Map(
      (senderProfiles ?? []).map((p) => [p.id, p.full_name ?? ""])
    );
  }

  // Enrich persons with resolved sender name
  const enrichedPersons = (personsRes.data ?? []).map((p) => {
    const raw = p as unknown as { invite_sent_by?: string | null } & typeof p;
    return {
      ...p,
      invite_sent_by_name: raw.invite_sent_by ? (senderNameMap.get(raw.invite_sent_by) ?? null) : null,
    };
  });

  // Fetch docs: include KYC-uploaded docs via client_profile_id for linked profiles
  const profileIds = (personsRes.data ?? [])
    .map((p) => (p as unknown as { client_profiles?: { id: string } }).client_profiles?.id)
    .filter((pid): pid is string => !!pid);

  const docsQuery = profileIds.length > 0
    ? supabase
        .from("documents")
        .select("id, file_name, mime_type, verification_status, verification_result, admin_status, prefill_dismissed_at, uploaded_at, document_type_id, client_profile_id, document_types(name, category)")
        .or(`service_id.eq.${id},client_profile_id.in.(${profileIds.join(",")})`)
        .eq("is_active", true)
    : supabase
        .from("documents")
        .select("id, file_name, mime_type, verification_status, verification_result, admin_status, prefill_dismissed_at, uploaded_at, document_type_id, client_profile_id, document_types(name, category)")
        .eq("service_id", id)
        .eq("is_active", true);

  const { data: docsData } = await docsQuery;

  return (
    <ClientServiceDetailClient
      service={serviceRes.data as unknown as ClientServiceRecord}
      documents={(docsData ?? []) as unknown as ClientServiceDoc[]}
      overrides={(overridesRes.data ?? []) as unknown as ServiceSectionOverride[]}
      persons={enrichedPersons as unknown as ServicePerson[]}
      requirements={(requirementsRes.data ?? []) as unknown as DueDiligenceRequirement[]}
      documentTypes={(documentTypesRes.data ?? []) as unknown as DocumentType[]}
      myRole={roleCheck.role}
      autoWizardStep={autoWizardStep}
    />
  );
}
