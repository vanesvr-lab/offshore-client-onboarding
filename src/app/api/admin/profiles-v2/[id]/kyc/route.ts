import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  // Whitelist KYC-updatable fields
  const ALLOWED = [
    // Individual
    "aliases", "work_address", "work_phone", "work_email",
    "date_of_birth", "nationality", "passport_country", "passport_number", "passport_expiry",
    "occupation", "tax_identification_number",
    // Financial
    "source_of_funds_description", "source_of_wealth_description",
    "is_pep", "pep_details", "legal_issues_declared", "legal_issues_details",
    // Organisation
    "business_website", "jurisdiction_incorporated", "date_of_incorporation",
    "listed_or_unlisted", "jurisdiction_tax_residence", "description_activity",
    "company_registration_number", "industry_sector", "regulatory_licenses",
    // Admin risk
    "sanctions_checked", "sanctions_checked_at", "sanctions_notes",
    "adverse_media_checked", "adverse_media_checked_at", "adverse_media_notes",
    "pep_verified", "pep_verified_at", "pep_verified_notes",
    "risk_rating", "risk_rating_justification",
    "geographic_risk_assessment", "relationship_history",
    // EDD
    "risk_flags", "senior_management_approval", "ongoing_monitoring_plan",
    // Progress
    "completion_status", "kyc_journey_completed",
  ];

  const updates: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

  // Update by client_profile_id (the profile's ID is the parent)
  const { error } = await supabase
    .from("client_profile_kyc")
    .update(updates)
    .eq("client_profile_id", params.id)
    .eq("tenant_id", tenantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
