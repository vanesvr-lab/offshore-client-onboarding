import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTenantId } from "@/lib/tenant";
import { ServiceDetailClient } from "./ServiceDetailClient";
import { loadServiceDetail } from "./loadServiceDetail";
import type { ServiceRecord } from "@/types";
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
  /** B-097 — manual override or OCR-extracted expiry; null falls back to type-level rule. */
  expiry_date: string | null;
  document_type_id: string | null;
  client_profile_id: string | null;
  document_types: { id?: string; name: string; category: string; valid_for_months: number | null } | null;
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

// B-100 / B-106 — waiver row passed through to the KycDocumentsTable
// (person-scope) + the Service Docs tab (application-scope). Matches the
// columns selected by `loadServiceDetail`.
//
// B-106 — `scope` distinguishes:
//   - "person"      → `client_profile_id` non-null, KYC waiver
//   - "application" → `client_profile_id` null, service-level waiver
export type WaivedDocumentRequirement = {
  id: string;
  client_profile_id: string | null;
  document_type_id: string;
  waived_at: string;
  waived_by: string;
  scope: "person" | "application";
};

// B-108 — one row per outbound email, ordered most-recent-first. Body is
// the rendered HTML stored verbatim at send time so the modal can replay
// exactly what the recipient received.
export type ServiceCommunication = {
  id: string;
  sent_at: string;
  sent_by: string | null;
  sent_by_name: string | null;
  sent_to_email: string | null;
  sent_to_profile_id: string | null;
  email_type: string;
  subject: string;
  body_html: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  status: "sent" | "failed";
};

// B-108 — admin-authored alerts. Auto alerts are computed at render
// time from current data (no persisted row).
export type ManualServiceAlert = {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  note: string | null;
  status: "open" | "resolved";
  created_at: string;
  created_by: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
};

// B-108 — dismissals of *auto* alerts. Key matches `AutoAlert.key`.
export type DismissedAutoAlert = {
  auto_alert_key: string;
  dismissed_at: string;
  dismissed_by: string | null;
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

  const tenantId = getTenantId(session);
  const payload = await loadServiceDetail(id, tenantId);

  return (
    <div>
      <ServiceDetailClient {...payload} currentUserId={session.user.id as string} />
    </div>
  );
}
