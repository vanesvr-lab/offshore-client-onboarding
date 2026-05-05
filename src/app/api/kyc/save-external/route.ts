import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/kyc/save-external
 *
 * B-056 §1.3 — rewritten to use `verification_codes.client_profile_id`
 * + `client_profile_kyc` (new schema) instead of the legacy
 * `kyc_records` table that was never being populated by send-invite.
 * Profile-level fields (full_name / email / phone / address) live on
 * `client_profiles` and are routed there separately so the legacy
 * single-line address column on the profile stays in sync with the
 * structured residential-address fields on the KYC row.
 */
export async function POST(req: NextRequest) {
  const { token, kycData } = (await req.json()) as {
    token?: string;
    kycData?: Record<string, unknown>;
  };

  if (!token || !kycData) {
    return NextResponse.json({ error: "Token and data are required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: vc } = await supabase
    .from("verification_codes")
    .select("client_profile_id, verified_at, expires_at, superseded_at")
    .eq("access_token", token)
    .maybeSingle();

  if (!vc || !vc.verified_at || vc.superseded_at) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (new Date(vc.expires_at) < new Date()) {
    return NextResponse.json({ error: "Link expired" }, { status: 410 });
  }

  if (!vc.client_profile_id) {
    return NextResponse.json({ error: "Profile not linked to invite" }, { status: 404 });
  }

  // Fields we accept from the client. Anything not on this list is dropped.
  const PROFILE_FIELDS = ["full_name", "email", "phone", "address"];
  const KYC_FIELDS = [
    "aliases",
    "work_address", "work_phone", "work_email",
    "date_of_birth", "nationality",
    "passport_country", "passport_number", "passport_expiry",
    "address_line_1", "address_line_2", "address_city",
    "address_state", "address_postal_code", "address_country",
    "occupation", "tax_identification_number",
    "source_of_funds_description", "source_of_wealth_description",
    "legal_issues_declared", "legal_issues_details",
    "kyc_journey_completed", "completion_status",
  ];

  const profileUpdates: Record<string, unknown> = {};
  const kycUpdates: Record<string, unknown> = {};

  const DATE_FIELDS = new Set(["date_of_birth", "passport_expiry"]);
  const BOOLEAN_FIELDS = new Set(["legal_issues_declared"]);

  for (const [k, v] of Object.entries(kycData)) {
    if (PROFILE_FIELDS.includes(k)) {
      if (v !== undefined && v !== null && v !== "") {
        profileUpdates[k] = v;
      }
      continue;
    }
    if (!KYC_FIELDS.includes(k)) continue;
    if (DATE_FIELDS.has(k) && (v === "" || v === null)) {
      kycUpdates[k] = null;
    } else if (BOOLEAN_FIELDS.has(k) && typeof v === "string") {
      kycUpdates[k] = v === "true";
    } else {
      kycUpdates[k] = v;
    }
  }

  if (Object.keys(kycUpdates).length > 0) {
    kycUpdates.updated_at = new Date().toISOString();
    const { error } = await supabase
      .from("client_profile_kyc")
      .update(kycUpdates)
      .eq("client_profile_id", vc.client_profile_id);
    if (error) {
      return NextResponse.json({ error: `Failed to save: ${error.message}` }, { status: 500 });
    }
  }

  if (Object.keys(profileUpdates).length > 0) {
    const { error } = await supabase
      .from("client_profiles")
      .update(profileUpdates)
      .eq("id", vc.client_profile_id);
    if (error) {
      return NextResponse.json({ error: `Failed to save profile: ${error.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
