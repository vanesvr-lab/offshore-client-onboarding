import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const { token, code } = (await req.json()) as { token?: string; code?: string };

  if (!token || !code) {
    return NextResponse.json({ error: "Token and code are required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Look up the verification code
  const { data: vc, error: vcErr } = await supabase
    .from("verification_codes")
    .select("*")
    .eq("access_token", token)
    .single();

  if (vcErr || !vc) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  // Check expiry
  if (new Date(vc.expires_at) < new Date()) {
    return NextResponse.json(
      { error: "This link has expired. Please ask the admin to send a new invite." },
      { status: 410 }
    );
  }

  // Check if already verified — allow re-access
  if (vc.verified_at) {
    return await returnKycData(supabase, vc.kyc_record_id);
  }

  // Check attempts (max 5)
  if (vc.attempts >= 5) {
    return NextResponse.json(
      { error: "Too many attempts. Please ask the admin to send a new invite." },
      { status: 429 }
    );
  }

  // Verify code
  if (vc.code !== code.trim()) {
    await supabase
      .from("verification_codes")
      .update({ attempts: vc.attempts + 1 })
      .eq("id", vc.id);

    const remaining = 4 - vc.attempts;
    return NextResponse.json(
      { error: `Incorrect code. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.` },
      { status: 401 }
    );
  }

  // Mark as verified
  await supabase
    .from("verification_codes")
    .update({ verified_at: new Date().toISOString() })
    .eq("id", vc.id);

  return await returnKycData(supabase, vc.kyc_record_id);
}

async function returnKycData(
  supabase: ReturnType<typeof createAdminClient>,
  kycRecordId: string
) {
  // Fetch KYC record with roles
  const { data: record } = await supabase
    .from("kyc_records")
    .select("*, profile_roles(*)")
    .eq("id", kycRecordId)
    .single();

  if (!record) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Fetch client info
  const { data: client } = await supabase
    .from("clients")
    .select("id, company_name, due_diligence_level")
    .eq("id", record.client_id)
    .single();

  // Fetch existing documents for this KYC record
  const { data: documents } = await supabase
    .from("documents")
    .select("*")
    .eq("kyc_record_id", kycRecordId);

  // Fetch role-based document requirements
  const { data: roleDocReqs } = await supabase
    .from("role_document_requirements")
    .select("*, document_types(*)");

  // Fetch DD requirements
  const { data: ddReqs } = await supabase
    .from("due_diligence_requirements")
    .select("*, document_types(*)");

  return NextResponse.json({
    verified: true,
    kycRecord: record,
    client: client ?? null,
    documents: documents ?? [],
    roleDocRequirements: roleDocReqs ?? [],
    ddRequirements: ddReqs ?? [],
  });
}
