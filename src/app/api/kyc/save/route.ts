import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { kycRecordId: string; fields: Record<string, unknown> };
  const { kycRecordId, fields } = body;

  if (!kycRecordId) {
    return NextResponse.json({ error: "kycRecordId is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch current record to compute completion_status
  const { data: current, error: fetchError } = await supabase
    .from("kyc_records")
    .select("*")
    .eq("id", kycRecordId)
    .single();

  if (fetchError || !current) {
    return NextResponse.json({ error: fetchError?.message ?? "Record not found" }, { status: 404 });
  }

  // Convert empty strings to null for date and boolean fields
  // PostgreSQL rejects "" for date columns and boolean columns
  const DATE_FIELDS = ["date_of_birth", "passport_expiry", "date_of_incorporation",
    "sanctions_checked_at", "adverse_media_checked_at", "pep_verified_at", "risk_rated_at"];
  const BOOLEAN_FIELDS = ["legal_issues_declared", "is_pep", "sanctions_checked",
    "adverse_media_checked", "pep_verified"];

  const cleanedFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (DATE_FIELDS.includes(key) && (value === "" || value === null)) {
      cleanedFields[key] = null;
    } else if (BOOLEAN_FIELDS.includes(key) && value === "") {
      cleanedFields[key] = null;
    } else {
      cleanedFields[key] = value;
    }
  }

  const merged = { ...current, ...cleanedFields };

  // Derive completion_status
  const isIndividual = (merged.record_type ?? current.record_type) === "individual";
  const requiredIndividual = [
    "full_name", "email", "date_of_birth", "nationality", "passport_number",
    "passport_expiry", "address", "occupation", "source_of_funds_description",
    "is_pep", "legal_issues_declared",
  ];
  const requiredOrganisation = [
    "full_name", "email", "address", "jurisdiction_incorporated",
    "date_of_incorporation", "listed_or_unlisted", "description_activity",
  ];
  const required = isIndividual ? requiredIndividual : requiredOrganisation;
  const allFilled = required.every(
    (f) => merged[f] !== null && merged[f] !== undefined && merged[f] !== ""
  );
  const completion_status = allFilled ? "complete" : "incomplete";

  const { data: updated, error: updateError } = await supabase
    .from("kyc_records")
    .update({
      ...cleanedFields,
      completion_status,
      filled_by: session.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", kycRecordId)
    .select()
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  revalidatePath(`/kyc`);
  return NextResponse.json({ record: updated });
}
