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

// B-100 — waiver row passed through to the KycDocumentsTable for the
// "Waived" pill + Un-waive action. Matches the columns selected by
// the parallel waivers query in this file.
export type WaivedDocumentRequirement = {
  id: string;
  client_profile_id: string;
  document_type_id: string;
  waived_at: string;
  waived_by: string;
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
      <ServiceDetailClient {...payload} />
    </div>
  );
}
