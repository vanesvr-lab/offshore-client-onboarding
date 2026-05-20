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
  ServiceCommunication,
  ManualServiceAlert,
  DismissedAutoAlert,
} from "./page";
import { hydrateReviewRequests } from "@/lib/review-requests/hydrate";
import type { HydratedReviewRequest } from "@/lib/review-requests/types";

// B-120 — Reference Forms + Submitted Forms surfaces. Active reference
// forms are scoped per (service_template, action_key); submitted forms
// belong to this service and are grouped by reference_form_id so each
// inline panel can render its "current submitted file + history" without
// a per-row refetch.
export interface ReferenceFormSummary {
  id: string;
  action_key: string;
  name: string;
  version_label: string | null;
  status: "active" | "deactivated";
  replaced_by_id: string | null;
  sort_order: number;
}
export interface SubmittedFormSummary {
  id: string;
  reference_form_id: string;
  action_key: string;
  file_name: string;
  uploaded_at: string;
  uploaded_by_name: string | null;
}

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
  communications: ServiceCommunication[];
  manualAlerts: ManualServiceAlert[];
  dismissedAutoAlerts: DismissedAutoAlert[];
  /** B-118 — peer/manager review requests for this service. Open first,
   *  then the 10 most-recent closed (matches GET API). */
  reviewRequests: HydratedReviewRequest[];
  /** B-120 — active reference forms grouped by action_key for the four
   *  Action subsections. */
  referenceFormsByAction: Record<string, ReferenceFormSummary[]>;
  /** B-120 — submitted form uploads for this service, grouped by
   *  reference_form_id. Each list is sorted most-recent-first. */
  submittedFormsByRefId: Record<string, SubmittedFormSummary[]>;
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
    communicationsRes,
    manualAlertsRes,
    dismissedAutoAlertsRes,
    reviewRequestsOpenRes,
    reviewRequestsClosedRes,
  ] = await Promise.all([
    supabase
      .from("services")
      .select(`*, service_templates(id, name, description, service_fields, min_local_directors)`)
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
          due_diligence_level, user_id, filing_rep_profile_id,
          filing_rep:filing_rep_profile_id(id, full_name, email, is_representative),
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
        verified_at,
        admin_status, admin_status_note, admin_status_by, admin_status_at,
        mime_type, uploaded_at, expiry_date, document_type_id, client_profile_id,
        service_id,
        document_types(id, name, category, valid_for_months),
        client_profiles(id, full_name, updated_at, client_profile_kyc(updated_at))
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
      .select("*, users:reviewed_by(full_name)")
      .eq("application_id", serviceId)
      .order("reviewed_at", { ascending: false }),

    supabase
      .from("waived_document_requirements")
      .select("id, client_profile_id, document_type_id, waived_at, waived_by, scope")
      .eq("service_id", serviceId)
      .eq("tenant_id", tenantId),

    supabase
      .from("service_profile_removals")
      .select("client_profile_id")
      .eq("service_id", serviceId)
      .eq("tenant_id", tenantId),

    // B-108 — outbound emails for this service. Capped at 200 (most-recent
    // first); pagination can come later if a single service ever exceeds.
    supabase
      .from("service_communications")
      .select(`
        id, sent_at, sent_by, sent_by_name, sent_to_email, sent_to_profile_id,
        email_type, subject, body_html, related_entity_type, related_entity_id, status
      `)
      .eq("service_id", serviceId)
      .eq("tenant_id", tenantId)
      .order("sent_at", { ascending: false })
      .limit(200),

    // B-108 Batch 3 — manual alerts (persisted) for this service.
    supabase
      .from("service_alerts")
      .select(
        "id, severity, title, note, status, created_at, created_by, resolved_at, resolved_by",
      )
      .eq("service_id", serviceId)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),

    // B-108 Batch 3 — dismissals of computed auto alerts.
    supabase
      .from("dismissed_auto_alerts")
      .select("auto_alert_key, dismissed_at, dismissed_by")
      .eq("service_id", serviceId)
      .eq("tenant_id", tenantId),

    // B-118 — open peer/manager review requests for this service.
    supabase
      .from("review_requests")
      .select(
        "id, service_id, requester_id, note, status, closed_at, closed_by, closed_reason, created_at",
      )
      .eq("service_id", serviceId)
      .eq("tenant_id", tenantId)
      .eq("status", "open")
      .order("created_at", { ascending: false }),

    // B-118 — last 10 closed peer/manager review requests for this service.
    supabase
      .from("review_requests")
      .select(
        "id, service_id, requester_id, note, status, closed_at, closed_by, closed_reason, created_at",
      )
      .eq("service_id", serviceId)
      .eq("tenant_id", tenantId)
      .eq("status", "closed")
      .order("closed_at", { ascending: false })
      .limit(10),
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
  // B-106 — service-scope waivers have `client_profile_id === null`; only
  // person-scope waivers are subject to the removed-profile filter.
  const filteredWaivers = removedProfileIds.size > 0
    ? ((waiversRes.data ?? []) as Array<{ client_profile_id: string | null }>)
        .filter((w) => !w.client_profile_id || !removedProfileIds.has(w.client_profile_id))
    : (waiversRes.data ?? []);

  // B-132 — surface personal KYC documents (identity / financial /
  // compliance) belonging to any profile attached to this service.
  // Those rows have service_id = NULL and follow the profile across
  // every service they're on. Query separately and merge into
  // docsRes; deduped by document id so a row that's already in the
  // service-scoped result doesn't appear twice.
  const attachedProfileIds = Array.from(
    new Set(
      ((filteredRoles as unknown as Array<{ client_profile_id: string | null }>) ?? [])
        .map((r) => r.client_profile_id)
        .filter((v): v is string => !!v),
    ),
  );
  if (attachedProfileIds.length > 0) {
    const { data: personalDocs } = await supabase
      .from("documents")
      .select(`
        id, file_name, file_path, verification_status, verification_result,
        verified_at,
        admin_status, admin_status_note, admin_status_by, admin_status_at,
        mime_type, uploaded_at, expiry_date, document_type_id, client_profile_id,
        service_id,
        document_types(id, name, category, valid_for_months),
        client_profiles(id, full_name, updated_at, client_profile_kyc(updated_at))
      `)
      .is("service_id", null)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .in("client_profile_id", attachedProfileIds);
    if (personalDocs && personalDocs.length > 0) {
      const seen = new Set(
        ((docsRes.data ?? []) as Array<{ id: string }>).map((d) => d.id),
      );
      const additions = (personalDocs as Array<{ id: string }>).filter(
        (d) => !seen.has(d.id),
      );
      if (additions.length > 0) {
        docsRes.data = [
          ...((docsRes.data ?? []) as unknown as Record<string, unknown>[]),
          ...(additions as unknown as Record<string, unknown>[]),
        ] as typeof docsRes.data;
      }
    }
  }

  // Template actions + substance ──────────────────────────────────────────
  const serviceTemplateId = (serviceRes.data as unknown as {
    service_template_id: string | null;
  }).service_template_id;

  const [
    templateActionsRes,
    existingActionsRes,
    substanceRes,
    referenceFormsRes,
    submittedFormsRes,
  ] = await Promise.all([
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
    // B-120 — active reference forms for this template, grouped per
    // action_key. Deactivated rows are excluded; submitted-form FKs still
    // point at historical reference_form_ids, so the panel resolves them
    // via `submittedFormsRes` rather than this list.
    serviceTemplateId
      ? supabase
          .from("reference_forms")
          .select("id, action_key, name, version_label, status, replaced_by_id, sort_order")
          .eq("service_template_id", serviceTemplateId)
          .eq("status", "active")
          .order("action_key")
          .order("sort_order")
      : Promise.resolve({ data: [] as Array<{
          id: string;
          action_key: string;
          name: string;
          version_label: string | null;
          status: "active" | "deactivated";
          replaced_by_id: string | null;
          sort_order: number;
        }>, error: null }),
    supabase
      .from("submitted_forms")
      .select("id, reference_form_id, action_key, file_name, uploaded_at, uploaded_by")
      .eq("service_id", serviceId)
      .order("uploaded_at", { ascending: false }),
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

  // B-120 — group reference forms by action_key and submitted forms by
  // reference_form_id. We also resolve uploaded_by → uploaded_by_name via
  // a single profiles lookup so the panel doesn't have to do per-row
  // joins (Supabase select-join on submitted_forms.uploaded_by would
  // require a declared FK; the lookup map keeps it simple).
  const referenceFormRows =
    (referenceFormsRes.data ?? []) as ReferenceFormSummary[];
  const referenceFormsByAction: Record<string, ReferenceFormSummary[]> = {};
  for (const row of referenceFormRows) {
    const key = row.action_key;
    if (!referenceFormsByAction[key]) referenceFormsByAction[key] = [];
    referenceFormsByAction[key].push(row);
  }

  type SubmittedRow = {
    id: string;
    reference_form_id: string;
    action_key: string;
    file_name: string;
    uploaded_at: string;
    uploaded_by: string;
  };
  const submittedRows = (submittedFormsRes.data ?? []) as SubmittedRow[];
  const uploaderIds = Array.from(new Set(submittedRows.map((r) => r.uploaded_by)));
  let uploaderNameById: Record<string, string | null> = {};
  if (uploaderIds.length > 0) {
    // B-145 — uploader name lookup now reads from public.users.
    // submitted_forms.uploaded_by was repointed by B-138's FK migration;
    // modern-flow admins live in users, not profiles, so the legacy
    // lookup returned null and the UI fell back to "Unknown uploader".
    const { data: uploaders } = await supabase
      .from("users")
      .select("id, full_name, email")
      .in("id", uploaderIds);
    uploaderNameById = Object.fromEntries(
      ((uploaders ?? []) as Array<{
        id: string;
        full_name: string | null;
        email: string | null;
      }>).map((u) => [u.id, u.full_name ?? u.email ?? null]),
    );
  }
  const submittedFormsByRefId: Record<string, SubmittedFormSummary[]> = {};
  for (const row of submittedRows) {
    const summary: SubmittedFormSummary = {
      id: row.id,
      reference_form_id: row.reference_form_id,
      action_key: row.action_key,
      file_name: row.file_name,
      uploaded_at: row.uploaded_at,
      uploaded_by_name: uploaderNameById[row.uploaded_by] ?? null,
    };
    if (!submittedFormsByRefId[row.reference_form_id]) {
      submittedFormsByRefId[row.reference_form_id] = [];
    }
    submittedFormsByRefId[row.reference_form_id].push(summary);
  }

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

  // B-118 — hydrate review requests with reviewer names + section list
  // before returning. Mirrors what the GET API endpoint does.
  type RawReviewRow = {
    id: string;
    service_id: string;
    requester_id: string;
    note: string;
    status: string;
    closed_at: string | null;
    closed_by: string | null;
    closed_reason: string | null;
    created_at: string;
  };
  const reviewRequestRows: RawReviewRow[] = [
    ...((reviewRequestsOpenRes.data ?? []) as RawReviewRow[]),
    ...((reviewRequestsClosedRes.data ?? []) as RawReviewRow[]),
  ];
  const hydratedReviewRequests = await hydrateReviewRequests(
    supabase,
    reviewRequestRows,
  );

  // B-137 — compute `context_is_stale` per per-person doc: the AI's
  // verification ran against context that's now older than the
  // profile's (or KYC row's) most recent update. False positives are
  // fine (admin clicks Re-run AI and the same verdict comes back); the
  // banner is purely a discoverability nudge. We mutate the doc rows
  // in place so the same flag survives the type cast below into
  // `ServiceDoc[]`.
  type RawDocForStaleness = {
    verified_at?: string | null;
    client_profile_id?: string | null;
    client_profiles?:
      | {
          updated_at?: string | null;
          client_profile_kyc?:
            | Array<{ updated_at?: string | null }>
            | { updated_at?: string | null }
            | null;
        }
      | null;
    context_is_stale?: boolean;
  };
  const rawDocs = (docsRes.data ?? []) as Array<Record<string, unknown>> & RawDocForStaleness[];
  for (const doc of rawDocs) {
    const verifiedAt = doc.verified_at ?? null;
    if (!verifiedAt || !doc.client_profile_id) {
      doc.context_is_stale = false;
      continue;
    }
    const profile = doc.client_profiles ?? null;
    const profileUpdatedAt = profile?.updated_at ?? null;
    const kycRow = Array.isArray(profile?.client_profile_kyc)
      ? profile?.client_profile_kyc?.[0] ?? null
      : (profile?.client_profile_kyc ?? null);
    const kycUpdatedAt = kycRow?.updated_at ?? null;
    doc.context_is_stale =
      (!!profileUpdatedAt && profileUpdatedAt > verifiedAt) ||
      (!!kycUpdatedAt && kycUpdatedAt > verifiedAt);
  }

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
    communications:
      (communicationsRes.data ?? []) as unknown as ServiceCommunication[],
    manualAlerts:
      (manualAlertsRes.data ?? []) as unknown as ManualServiceAlert[],
    dismissedAutoAlerts:
      (dismissedAutoAlertsRes.data ?? []) as unknown as DismissedAutoAlert[],
    reviewRequests: hydratedReviewRequests,
    referenceFormsByAction,
    submittedFormsByRefId,
  };
}
