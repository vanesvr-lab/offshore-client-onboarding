import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { ServiceDetailClient } from "./ServiceDetailClient";
import type { ServiceRecord, ProfileServiceRole, ServiceSectionOverride, ClientProfile, DueDiligenceRequirement, DocumentType } from "@/types";
import type { ServiceField } from "@/components/shared/DynamicServiceForm";

export const dynamic = "force-dynamic";

export type ServiceDoc = {
  id: string;
  file_name: string;
  file_path: string;
  verification_status: string;
  uploaded_at: string;
  document_type_id: string | null;
  client_profile_id: string | null;
  document_types: { id?: string; name: string; category: string } | null;
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
    profilesRes,
    adminUsersRes,
    auditRes,
    requirementsRes,
    documentTypesRes,
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
        id, file_name, file_path, verification_status, uploaded_at,
        document_type_id, client_profile_id,
        document_types(id, name, category)
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
      .select("*, document_types(id, name)")
      .eq("tenant_id", tenantId)
      .order("sort_order"),

    // Document types for upload dialog
    supabase
      .from("document_types")
      .select("*")
      .eq("tenant_id", tenantId),
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
        allProfiles={(profilesRes.data ?? []) as unknown as ClientProfile[]}
        adminUsers={adminUsers}
        auditEntries={(auditRes.data ?? []) as unknown as ServiceAuditEntry[]}
        requirements={(requirementsRes.data ?? []) as unknown as DueDiligenceRequirement[]}
        documentTypes={(documentTypesRes.data ?? []) as unknown as DocumentType[]}
      />
    </div>
  );
}
