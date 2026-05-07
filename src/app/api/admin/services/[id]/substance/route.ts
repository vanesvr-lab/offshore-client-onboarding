import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";
import type { ServiceSubstance, SubstanceAssessment } from "@/types";

const ASSESSMENTS: SubstanceAssessment[] = ["pass", "review", "fail"];

// All editable substance fields. Audit fields (admin_assessed_by/_at,
// created_at, updated_at, id, tenant_id, service_id, generated_pdf_id) are
// set server-side, NOT accepted from the client.
const EDITABLE_FIELDS = [
  // §3.2
  "has_two_mu_resident_directors",
  "principal_bank_account_in_mu",
  "accounting_records_in_mu",
  "audited_in_mu",
  "board_meetings_with_mu_quorum",
  "cis_administered_from_mu",
  // §3.3
  "has_office_premises_in_mu",
  "office_address",
  "has_full_time_mu_employee",
  "employee_count",
  "arbitration_clause_in_mu",
  "arbitration_clause_text",
  "holds_mu_assets_above_100k_usd",
  "mu_assets_value_usd",
  "mu_assets_description",
  "shares_listed_on_mu_exchange",
  "exchange_listing_reference",
  "has_reasonable_mu_expenditure",
  "yearly_mu_expenditure_usd",
  "expenditure_justification",
  // §3.4
  "related_corp_satisfies_3_3",
  "related_corp_name",
  // assessment
  "admin_assessment",
  "admin_assessment_notes",
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];

/**
 * GET /api/admin/services/[id]/substance
 * Returns the existing substance row for this service, or `{ data: null }`
 * if not yet created.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  const { data, error } = await supabase
    .from("service_substance")
    .select("*")
    .eq("service_id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data as unknown as ServiceSubstance | null) ?? null });
}

/**
 * PUT /api/admin/services/[id]/substance
 * Upserts the substance row keyed on (service_id). The body may contain any
 * subset of EDITABLE_FIELDS; unknown fields are ignored. When
 * admin_assessment is set or changed, admin_assessed_by + admin_assessed_at
 * are populated server-side from the session.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  // Confirm service exists in tenant before touching substance
  const { data: service, error: svcErr } = await supabase
    .from("services")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("is_deleted", false)
    .maybeSingle();
  if (svcErr) return NextResponse.json({ error: svcErr.message }, { status: 500 });
  if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });

  // Build patch from editable allowlist
  const patch: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS) {
    if (key in body) patch[key as EditableField] = body[key];
  }

  // Validate admin_assessment value if provided
  if ("admin_assessment" in patch) {
    const a = patch.admin_assessment;
    if (a !== null && !ASSESSMENTS.includes(a as SubstanceAssessment)) {
      return NextResponse.json(
        { error: `admin_assessment must be one of ${ASSESSMENTS.join(", ")} or null` },
        { status: 400 }
      );
    }
  }

  const nowIso = new Date().toISOString();
  patch.updated_at = nowIso;

  // Read existing to detect assessment transition
  const { data: existing, error: readErr } = await supabase
    .from("service_substance")
    .select("id, admin_assessment")
    .eq("service_id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

  if ("admin_assessment" in patch) {
    const before = (existing as { admin_assessment?: string | null } | null)?.admin_assessment ?? null;
    const after = patch.admin_assessment as SubstanceAssessment | null;
    if (after && after !== before) {
      patch.admin_assessed_by = session.user.id;
      patch.admin_assessed_at = nowIso;
    } else if (after === null) {
      patch.admin_assessed_by = null;
      patch.admin_assessed_at = null;
    }
  }

  if (existing) {
    const { data, error } = await supabase
      .from("service_substance")
      .update(patch)
      .eq("id", (existing as { id: string }).id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // B-077 Batch 7 — only audit when admin_assessment was part of this
    // patch (the assessment is the meaningful event). Saves to other
    // substance fields are left silent to avoid noise.
    if ("admin_assessment" in patch) {
      const before =
        (existing as { admin_assessment?: string | null } | null)
          ?.admin_assessment ?? null;
      const after = (patch.admin_assessment as SubstanceAssessment | null) ?? null;
      await writeAuditLog(supabase, {
        actor_id: session.user.id,
        actor_role: "admin",
        action: before
          ? "substance_review_updated"
          : "substance_review_saved",
        entity_type: "service",
        entity_id: id,
        previous_value: { admin_assessment: before },
        new_value: {
          admin_assessment: after,
          admin_assessment_notes:
            (patch.admin_assessment_notes as string | null | undefined) ?? null,
        },
      });
    }
    return NextResponse.json({ data: data as unknown as ServiceSubstance });
  }

  const insert: Record<string, unknown> = {
    ...patch,
    service_id: id,
    tenant_id: tenantId,
  };
  const { data, error } = await supabase
    .from("service_substance")
    .insert(insert)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if ("admin_assessment" in patch) {
    await writeAuditLog(supabase, {
      actor_id: session.user.id,
      actor_role: "admin",
      action: "substance_review_saved",
      entity_type: "service",
      entity_id: id,
      previous_value: null,
      new_value: {
        admin_assessment: (patch.admin_assessment as SubstanceAssessment | null) ?? null,
        admin_assessment_notes:
          (patch.admin_assessment_notes as string | null | undefined) ?? null,
      },
    });
  }

  return NextResponse.json({ data: data as unknown as ServiceSubstance });
}
