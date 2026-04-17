import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = getTenantId(session);
  const body = (await request.json()) as { kycRecordId: string; fields: Record<string, unknown> };
  const { kycRecordId, fields } = body;

  if (!kycRecordId) return NextResponse.json({ error: "kycRecordId is required" }, { status: 400 });

  const supabase = createAdminClient();

  // Verify this kyc record belongs to tenant
  const { data: existing } = await supabase
    .from("client_profile_kyc")
    .select("id, client_profile_id")
    .eq("id", kycRecordId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Clean date/boolean fields
  const DATE_FIELDS = ["date_of_birth", "passport_expiry", "date_of_incorporation"];
  const BOOLEAN_FIELDS = ["legal_issues_declared", "is_pep", "sanctions_checked", "adverse_media_checked", "pep_verified"];

  // Fields that exist on client_profiles, not client_profile_kyc — skip these
  const EXCLUDED_FIELDS = ["client_id", "profile_id", "full_name", "email", "phone",
    "record_type", "is_primary", "due_diligence_level", "invite_sent_at", "invite_sent_by",
    "filled_by", "id", "tenant_id", "created_at", "updated_at", "client_profile_id"];

  const cleanedFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (EXCLUDED_FIELDS.includes(key)) continue;
    if (DATE_FIELDS.includes(key) && (value === "" || value === null)) {
      cleanedFields[key] = null;
    } else if (BOOLEAN_FIELDS.includes(key) && value === "") {
      cleanedFields[key] = null;
    } else {
      cleanedFields[key] = value;
    }
  }

  const { data: updated, error } = await supabase
    .from("client_profile_kyc")
    .update({
      ...cleanedFields,
      updated_at: new Date().toISOString(),
    })
    .eq("id", kycRecordId)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ record: updated });
}
