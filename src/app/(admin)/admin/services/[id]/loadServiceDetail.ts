// B-102 — shared data loader for the service detail surfaces.
//
// Returns the props payload passed to `ServiceDetailClient` so both the
// scroll page (`./page.tsx`) and the Review Wizard page (`./review/page.tsx`)
// can read identical data without re-implementing the parallel Supabase
// queries. Auth gating stays in the calling page.

import "server-only";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ProfileServiceRole,
  ServiceSectionOverride,
  ClientProfile,
  DueDiligenceRequirement,
  DocumentType,
  ApplicationSectionReview,
  ServiceTemplateAction,
  ServiceAction,
  ServiceSubstance,
  FieldExtraction,
} from "@/types";
import type {
  ServiceWithTemplate,
  ServiceDoc,
  AdminUser,
  ServiceAuditEntry,
  DocumentUpdateRequest,
  WaivedDocumentRequirement,
} from "./page";

export interface ServiceDetailPayload {
  service: ServiceWithTemplate;
  roles: ProfileServiceRole[];
  overrides: ServiceSectionOverride[];
  documents: ServiceDoc[];
  updateRequests: DocumentUpdateRequest[];
  allProfiles: ClientProfile[];
  adminUsers: AdminUser[];
  auditEntries: ServiceAuditEntry[];
  requirements: DueDiligenceRequirement[];
  documentTypes: DocumentType[];
  sectionReviews: ApplicationSectionReview[];
  templateActions: ServiceTemplateAction[];
  actionsByKey: Record<string, ServiceAction>;
  substance: ServiceSubstance | null;
  fieldExtractions: FieldExtraction[];
  lastStatusChange: ServiceAuditEntry | null;
  waivers: WaivedDocumentRequirement[];
}

export async function loadServiceDetail(
  serviceId: string,
  tenantId: string,
): Promise<ServiceDetailPayload> {
  const supabase = createAdminClient();

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
    waiversRes,
    removalsRes,
  ] = await Promise.all([
    supabase
      .from("services")
      .select(`*, service_templates(id, name, description, service_fields)`)
      .eq("id", serviceId)
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
      .eq("service_id", serviceId)
      .eq("tenant_id", tenantId),

    supabase
      .from("service_section_overrides")
      .select("*")
      .eq("service_id", serviceId)
      .eq("tenant_id", tenantId),

    supabase
      .from("documents")
      .select(`
        id, file_name, file_path, verification_status, verification_result,
        admin_status, admin_status_note, admin_status_by, admin_status_at,
        mime_type, uploaded_at, expiry_date, document_type_id, client_profile_id,
        document_types(id, name, category, valid_for_months),
        client_profiles(id, full_name)
      `)
      .eq("service_id", serviceId)
      .eq("is_active", true),

    supabase
      .from("document_update_requests")
      .select("*")
      .eq("service_id", serviceId)
      .order("sent_at", { ascending: false }),

    supabase
      .from("client_profiles")
      .select("id, full_name, email, record_type, is_representative, due_diligence_level")
      .eq("tenant_id", tenantId)
      .eq("is_deleted", false)
      .order("full_name"),

    supabase
      .from("admin_users")
      .select("user_id, users(full_name, email)"),

    supabase
      .from("audit_log")
      .select(
        "id, created_at, actor_id, actor_name, actor_role, action, entity_type, entity_id, previous_value, new_value, detail",
      )
      .eq("entity_type", "service")
      .eq("entity_id", serviceId)
      .order("created_at", { ascending: false })
      .limit(100),

    supabase
      .from("due_diligence_requirements")
      .select("*, document_types(id, name, category, scope)")
      .eq("tenant_id", tenantId)
      .order("sort_order"),

    supabase
      .from("document_types")
      .select("*")
      .eq("tenant_id", tenantId),

    supabase
      .from("application_section_reviews")
      .select("*, profiles:reviewed_by(full_name)")
      .eq("application_id", serviceId)
      .order("reviewed_at", { ascending: false }),

    supabase
      .from("waived_document_requirements")
      .select("id, client_profile_id, document_type_id, waived_at, waived_by")
      .eq("service_id", serviceId)
      .eq("tenant_id", tenantId),

    supabase
      .from("service_profile_removals")
      .select("client_profile_id")
      .eq("service_id", serviceId)
      .eq("tenant_id", tenantId),
  ]);

  if (!serviceRes.data) notFound();

  // B-101 Batch 3 — apply soft-delete filter to every per-profile collection.
  const removedProfileIds = new Set(
    ((removalsRes.data ?? []) as Array<{ client_profile_id: string }>)
      .map((r) => r.client_profile_id)
      .filter((v): v is string => !!v),
  );
  const filteredRoles = removedProfileIds.size > 0
    ? ((rolesRes.data ?? []) as Array<{ client_profile_id: string | null }>)
        .filter((r) => !r.client_profile_id || !removedProfileIds.has(r.client_profile_id))
    : (rolesRes.data ?? []);
  const filteredWaivers = removedProfileIds.size > 0
    ? ((waiversRes.data ?? []) as Array<{ client_profile_id: string }>)
        .filter((w) => !removedProfileIds.has(w.client_profile_id))
    : (waiversRes.data ?? []);

  // Template actions + substance ──────────────────────────────────────────
  const serviceTemplateId = (serviceRes.data as unknown as {
    service_template_id: string | null;
  }).service_template_id;

  const [templateActionsRes, existingActionsRes, substanceRes] = await Promise.all([
    serviceTemplateId
      ? supabase
          .from("service_template_actions")
          .select("*")
          .eq("service_template_id", serviceTemplateId)
          .eq("tenant_id", tenantId)
          .order("sort_order")
      : Promise.resolve({ data: [] as ServiceTemplateAction[], error: null }),
    supabase
      .from("service_actions")
      .select("*")
      .eq("service_id", serviceId)
      .eq("tenant_id", tenantId),
    supabase
      .from("service_substance")
      .select("*")
      .eq("service_id", serviceId)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  const profileIdsForFE = (filteredRoles as unknown as ProfileServiceRole[])
    .map((r) => r.client_profile_id)
    .filter((pid): pid is string => !!pid);

  const fieldExtractionsRes =
    profileIdsForFE.length > 0
      ? await supabase
          .from("field_extractions")
          .select("*")
          .in("client_profile_id", profileIdsForFE)
          .order("extracted_at", { ascending: false })
      : { data: [] as FieldExtraction[] };

  const docIdsForAudit = ((docsRes.data ?? []) as { id: string }[]).map((d) => d.id);
  const auditDocsRes =
    docIdsForAudit.length > 0
      ? await supabase
          .from("audit_log")
          .select(
            "id, created_at, actor_id, actor_name, actor_role, action, entity_type, entity_id, previous_value, new_value, detail",
          )
          .eq("entity_type", "document")
          .in("entity_id", docIdsForAudit)
          .order("created_at", { ascending: false })
          .limit(100)
      : { data: [] as ServiceAuditEntry[] };

  const profileIdsForAudit = (filteredRoles as Array<{
    client_profile_id: string | null;
  }>)
    .map((r) => r.client_profile_id)
    .filter((v): v is string => !!v);
  const profileIdsUnique = Array.from(new Set(profileIdsForAudit));
  const auditProfilesRes =
    profileIdsUnique.length > 0
      ? await supabase
          .from("audit_log")
          .select(
            "id, created_at, actor_id, actor_name, actor_role, action, entity_type, entity_id, previous_value, new_value, detail",
          )
          .eq("entity_type", "client_profile")
          .in("entity_id", profileIdsUnique)
          .order("created_at", { ascending: false })
          .limit(100)
      : { data: [] as ServiceAuditEntry[] };

  const mergedAuditEntries = [
    ...((auditRes.data ?? []) as unknown as ServiceAuditEntry[]),
    ...((auditDocsRes.data ?? []) as unknown as ServiceAuditEntry[]),
    ...((auditProfilesRes.data ?? []) as unknown as ServiceAuditEntry[]),
  ]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 100);

  const lastStatusChange =
    ((auditRes.data ?? []) as unknown as ServiceAuditEntry[]).find(
      (e) => e.action === "status_changed" || e.action === "service_created",
    ) ?? null;

  const templateActions =
    (templateActionsRes.data ?? []) as unknown as ServiceTemplateAction[];
  let actionInstances =
    (existingActionsRes.data ?? []) as unknown as ServiceAction[];
  const haveKeys = new Set(actionInstances.map((a) => a.action_key));
  const missing = templateActions.filter((ta) => !haveKeys.has(ta.action_key));
  if (missing.length > 0) {
    const { data: created } = await supabase
      .from("service_actions")
      .insert(
        missing.map((ta) => ({
          service_id: serviceId,
          action_key: ta.action_key,
          status: "pending" as const,
          tenant_id: tenantId,
        })),
      )
      .select("*");
    actionInstances = [
      ...actionInstances,
      ...((created ?? []) as unknown as ServiceAction[]),
    ];
  }
  const actionsByKey = Object.fromEntries(
    actionInstances.map((a) => [a.action_key, a]),
  ) as Record<string, ServiceAction>;
  const substance = (substanceRes.data ?? null) as ServiceSubstance | null;

  const adminUsers: AdminUser[] = (adminUsersRes.data ?? []).map((u) => {
    const users = (u as unknown as {
      user_id: string;
      users: { full_name: string | null; email: string | null } | null;
    }).users;
    return {
      user_id: u.user_id,
      full_name: users?.full_name ?? null,
      email: users?.email ?? null,
    };
  });

  return {
    service: serviceRes.data as unknown as ServiceWithTemplate,
    roles: filteredRoles as unknown as ProfileServiceRole[],
    overrides: (overridesRes.data ?? []) as unknown as ServiceSectionOverride[],
    documents: (docsRes.data ?? []) as unknown as ServiceDoc[],
    updateRequests:
      (updateRequestsRes.data ?? []) as unknown as DocumentUpdateRequest[],
    allProfiles: (profilesRes.data ?? []) as unknown as ClientProfile[],
    adminUsers,
    auditEntries: mergedAuditEntries,
    requirements:
      (requirementsRes.data ?? []) as unknown as DueDiligenceRequirement[],
    documentTypes: (documentTypesRes.data ?? []) as unknown as DocumentType[],
    sectionReviews:
      (sectionReviewsRes.data ?? []) as unknown as ApplicationSectionReview[],
    templateActions,
    actionsByKey,
    substance,
    fieldExtractions:
      (fieldExtractionsRes.data ?? []) as unknown as FieldExtraction[],
    lastStatusChange,
    waivers: filteredWaivers as unknown as WaivedDocumentRequirement[],
  };
}
