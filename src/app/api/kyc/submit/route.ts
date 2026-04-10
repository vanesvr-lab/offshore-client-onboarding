import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { clientId: string };
  const { clientId } = body;

  if (!clientId) {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch client + all kyc_records
  const [{ data: client }, { data: records }] = await Promise.all([
    supabase.from("clients").select("id, client_type").eq("id", clientId).single(),
    supabase.from("kyc_records").select("*").eq("client_id", clientId),
  ]);

  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const requiredIndividual = [
    "full_name", "email", "date_of_birth", "nationality", "passport_number",
    "passport_expiry", "address", "occupation", "source_of_funds_description",
    "is_pep", "legal_issues_declared",
  ];
  const requiredOrganisation = [
    "full_name", "email", "address", "jurisdiction_incorporated",
    "date_of_incorporation", "listed_or_unlisted", "description_activity",
  ];

  const errors: string[] = [];

  for (const record of records ?? []) {
    const required = record.record_type === "individual" ? requiredIndividual : requiredOrganisation;
    const missing = required.filter(
      (f) => (record as Record<string, unknown>)[f] === null ||
             (record as Record<string, unknown>)[f] === undefined ||
             (record as Record<string, unknown>)[f] === ""
    );
    if (missing.length > 0) {
      const label = record.full_name ?? record.record_type;
      errors.push(`${label}: missing ${missing.join(", ")}`);
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "Incomplete KYC", errors }, { status: 422 });
  }

  // Mark all records complete + update client
  const now = new Date().toISOString();
  const recordIds = (records ?? []).map((r) => r.id);

  const [{ error: recErr }, { error: clientErr }] = await Promise.all([
    supabase
      .from("kyc_records")
      .update({ completion_status: "complete", updated_at: now })
      .in("id", recordIds),
    supabase
      .from("clients")
      .update({ kyc_completed_at: now })
      .eq("id", clientId),
  ]);

  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 });
  if (clientErr) return NextResponse.json({ error: clientErr.message }, { status: 500 });

  revalidatePath(`/kyc`);
  return NextResponse.json({ success: true });
}
