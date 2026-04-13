import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const { token, kycData } = (await req.json()) as {
    token?: string;
    kycData?: Record<string, unknown>;
  };

  if (!token || !kycData) {
    return NextResponse.json({ error: "Token and data are required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Verify the token is valid and verified
  const { data: vc } = await supabase
    .from("verification_codes")
    .select("kyc_record_id, verified_at, expires_at")
    .eq("access_token", token)
    .single();

  if (!vc || !vc.verified_at) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (new Date(vc.expires_at) < new Date()) {
    return NextResponse.json({ error: "Link expired" }, { status: 410 });
  }

  // Whitelist allowed fields to prevent injection of admin-only fields
  const ALLOWED_FIELDS = [
    "full_name", "email", "phone", "address", "aliases",
    "work_address", "work_phone", "work_email",
    "date_of_birth", "nationality", "passport_country", "passport_number", "passport_expiry",
    "occupation", "tax_identification_number",
    "source_of_funds_description", "source_of_wealth_description",
    "legal_issues_declared", "legal_issues_details",
    "kyc_journey_completed", "completion_status",
  ];

  const safeData: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in kycData) {
      safeData[key] = kycData[key];
    }
  }

  safeData.updated_at = new Date().toISOString();

  // Update the KYC record
  const { error } = await supabase
    .from("kyc_records")
    .update(safeData)
    .eq("id", vc.kyc_record_id);

  if (error) {
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
