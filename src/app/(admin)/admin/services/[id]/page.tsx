import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { ServiceDetailClient } from "./ServiceDetailClient";
import type { ServiceRecord, ProfileServiceRole, ServiceSectionOverride, ClientProfile, DueDiligenceRequirement, DocumentType, ApplicationSectionReview } from "@/types";
import type { ServiceField } from "@/components/shared/DynamicServiceForm";

export const dynamic = "force-dynamic";

export type ServiceDoc = {
  id: string;
  file_name: string;
  file_path: string;
  verification_status: string;
  verification_result: Record<string, unknown> | null;
  admin_status: string | null;
  admin_status_note: string | null;
  admin_status_by: string | null;
  admin_status_at: string | null;
  mime_type: string | null;
  uploaded_at: string;
  document_type_id: string | null;
  client_profile_id: string | null;
  document_types: { id?: string; name: string; category: string } | null;
  client_profiles: { id: string; full_name: string | null } | null;
};

export type DocumentUpdateRequest = {
  id: string;
  document_id: string;
  service_id: string;
  requested_by: string;
  requested_by_name: string | null;
  sent_to_profile_id: string;
  sent_to_email: string | null;
  note: string;
  auto_populated_from_flags: boolean | null;
  sent_at: string;
};

export type ServiceWithTemplate = ServiceRecord & {
  service_templates: {
    id: string;
    name: string;
    description: string | null;
    service_fields: ServiceField[] | null;
  } | null;
};

export type AdminUser = {
  user_id: string;
  full_name: string | null;
  email: string | null;
};

export type ServiceAuditEntry = {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: "client" | "admin" | "system" | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  detail: Record<string, unknown> | null;
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

  const [
    serviceRes,
    rolesRes,
    overridesRes,
    docsRes,
    updateRequestsRes,
    profilesRes,
    adminUsersRes,
    auditRes,
    requirementsRes,
    documentTypesRes,
    sectionReviewsRes,
  ] = await Promise.all([
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
          client_profile_kyc(*)
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
        id, file_name, file_path, verification_status, verification_result,
        admin_status, admin_status_note, admin_status_by, admin_status_at,
        mime_type, uploaded_at, document_type_id, client_profile_id,
        document_types(id, name, category),
        client_profiles(id, full_name)
      `)
      .eq("service_id", id)
      .eq("is_active", true),

    // Document update requests for this service
    supabase
      .from("document_update_requests")
      .select("*")
      .eq("service_id", id)
      .order("sent_at", { ascending: false }),

    // All profiles for "Add profile" dialog
    supabase
      .from("client_profiles")
      .select("id, full_name, email, record_type, is_representative, due_diligence_level")
      .eq("tenant_id", tenantId)
      .eq("is_deleted", false)
      .order("full_name"),

    // Admin users for manager dropdown
    supabase
      .from("admin_users")
      .select("user_id, users(full_name, email)")
      .eq("tenant_id", tenantId),

    // Audit log entries for this service
    supabase
      .from("audit_log")
      .select("id, created_at, actor_id, actor_name, actor_role, action, entity_type, entity_id, previous_value, new_value, detail")
      .eq("entity_type", "service")
      .eq("entity_id", id)
      .order("created_at", { ascending: false })
      .limit(100),

    // DD requirements for risk/compliance section
    supabase
      .from("due_diligence_requirements")
      .select("*, document_types(id, name, category, scope)")
      .eq("tenant_id", tenantId)
      .order("sort_order"),

    // Document types for upload dialog
    supabase
      .from("document_types")
      .select("*")
      .eq("tenant_id", tenantId),

    // B-073 — section reviews keyed by service.id (column is misleadingly
    // named application_id; see tech-debt #26).
    supabase
      .from("application_section_reviews")
      .select("*, profiles:reviewed_by(full_name)")
      .eq("application_id", id)
      .order("reviewed_at", { ascending: false }),
  ]);

  if (!serviceRes.data) notFound();

  // Flatten admin users (users join comes as array)
  const adminUsers: AdminUser[] = (adminUsersRes.data ?? []).map((u) => {
    const users = (u as unknown as { user_id: string; users: { full_name: string | null; email: string | null } | null }).users;
    return {
      user_id: u.user_id,
      full_name: users?.full_name ?? null,
      email: users?.email ?? null,
    };
  });

  return (
    <div>
      <ServiceDetailClient
        service={serviceRes.data as unknown as ServiceWithTemplate}
        roles={(rolesRes.data ?? []) as unknown as ProfileServiceRole[]}
        overrides={(overridesRes.data ?? []) as unknown as ServiceSectionOverride[]}
        documents={(docsRes.data ?? []) as unknown as ServiceDoc[]}
        updateRequests={(updateRequestsRes.data ?? []) as unknown as DocumentUpdateRequest[]}
        allProfiles={(profilesRes.data ?? []) as unknown as ClientProfile[]}
        adminUsers={adminUsers}
        auditEntries={(auditRes.data ?? []) as unknown as ServiceAuditEntry[]}
        requirements={(requirementsRes.data ?? []) as unknown as DueDiligenceRequirement[]}
        documentTypes={(documentTypesRes.data ?? []) as unknown as DocumentType[]}
        sectionReviews={(sectionReviewsRes.data ?? []) as unknown as ApplicationSectionReview[]}
      />
    </div>
  );
}
