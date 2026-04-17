import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { calcSectionCompletion } from "@/lib/utils/serviceCompletion";
import type { ServiceField } from "@/components/shared/DynamicServiceForm";

export interface ValidationIssue {
  section: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

/**
 * POST /api/services/[id]/validate
 * Runs all pre-submit validation checks and returns issues.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: serviceId } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);
  const clientProfileId = session.user.clientProfileId;
  if (!clientProfileId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Verify can_manage
  const { data: roleCheck } = await supabase
    .from("profile_service_roles")
    .select("id")
    .eq("service_id", serviceId)
    .eq("client_profile_id", clientProfileId)
    .eq("can_manage", true)
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();

  if (!roleCheck) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Fetch service + persons + documents in parallel
  const [serviceRes, personsRes, docsRes, requirementsRes] = await Promise.all([
    supabase
      .from("services")
      .select("service_details, service_templates(service_fields)")
      .eq("id", serviceId)
      .maybeSingle(),

    supabase
      .from("profile_service_roles")
      .select(`
        id, role, shareholding_percentage,
        client_profiles(id, client_profile_kyc(*))
      `)
      .eq("service_id", serviceId)
      .eq("tenant_id", tenantId),

    supabase
      .from("documents")
      .select("id, verification_status, document_type_id")
      .eq("service_id", serviceId)
      .eq("tenant_id", tenantId)
      .eq("is_active", true),

    supabase
      .from("due_diligence_requirements")
      .select("document_type_id, requirement_type, label")
      .eq("tenant_id", tenantId)
      .eq("requirement_type", "document"),
  ]);

  if (!serviceRes.data) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  const serviceDetails = (serviceRes.data.service_details ?? {}) as Record<string, unknown>;
  const serviceFields = ((serviceRes.data.service_templates as unknown as { service_fields?: unknown } | null)?.service_fields ?? []) as ServiceField[];
  const persons = personsRes.data ?? [];
  const documents = docsRes.data ?? [];
  const requiredDocTypes = requirementsRes.data ?? [];

  const issues: ValidationIssue[] = [];

  // ── 1. Service fields: Company Setup, Financial, Banking ──────────────────
  const sections = [
    { key: "company_setup" as const, label: "Company Setup", step: 0 },
    { key: "financial" as const,     label: "Financial",     step: 1 },
    { key: "banking" as const,       label: "Banking",       step: 2 },
  ];
  for (const { key, label } of sections) {
    const completion = calcSectionCompletion(serviceFields, serviceDetails, key);
    if (completion.percentage < 100) {
      issues.push({
        section: label,
        message: `${label} section has required fields that are not filled in.`,
      });
    }
  }

  // ── 2. People: at least one director ─────────────────────────────────────
  const hasDirector = persons.some((p) => p.role === "director");
  if (!hasDirector) {
    issues.push({
      section: "People & KYC",
      message: "At least one Director must be added to the service.",
    });
  }

  // ── 3. Shareholding sums to ~100% ────────────────────────────────────────
  const shareholders = persons.filter((p) => p.role === "shareholder");
  if (shareholders.length > 0) {
    const total = shareholders.reduce((sum, p) => sum + (p.shareholding_percentage ?? 0), 0);
    if (total < 95 || total > 105) {
      issues.push({
        section: "People & KYC",
        message: `Shareholder ownership must total 100% (currently ${total}%).`,
      });
    }
  }

  // ── 4. All persons have KYC completed ────────────────────────────────────
  const incompleteKyc = persons.filter((p) => {
    const kyc = (p.client_profiles as unknown as { client_profile_kyc: Record<string, unknown> | null } | null)?.client_profile_kyc;
    return !kyc || kyc.kyc_journey_completed !== true;
  });
  if (incompleteKyc.length > 0) {
    issues.push({
      section: "People & KYC",
      message: `${incompleteKyc.length} person(s) have not completed their KYC information.`,
    });
  }

  // ── 5. Required documents uploaded ───────────────────────────────────────
  const uploadedTypeIds = new Set(documents.map((d) => d.document_type_id));
  const missingDocs = requiredDocTypes.filter(
    (r) => r.document_type_id && !uploadedTypeIds.has(r.document_type_id)
  );
  if (missingDocs.length > 0) {
    issues.push({
      section: "Documents",
      message: `${missingDocs.length} required document(s) have not been uploaded: ${missingDocs.map((d) => d.label).join(", ")}.`,
    });
  }

  // ── 6. No flagged/rejected documents ─────────────────────────────────────
  const flaggedDocs = documents.filter(
    (d) => d.verification_status === "flagged" || d.verification_status === "rejected"
  );
  if (flaggedDocs.length > 0) {
    issues.push({
      section: "Documents",
      message: `${flaggedDocs.length} document(s) have been flagged or rejected and need to be replaced.`,
    });
  }

  const result: ValidationResult = {
    valid: issues.length === 0,
    issues,
  };

  return NextResponse.json(result);
}
