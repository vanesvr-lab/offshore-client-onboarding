import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { calculateComplianceScore } from "@/lib/utils/complianceScoring";
import type { KycRecord, DocumentRecord, DueDiligenceRequirement, DueDiligenceLevel } from "@/types";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { clientId: string };
  const { clientId } = body;

  if (!clientId) {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch client + all kyc_records + documents + DD settings
  const [{ data: client }, { data: records }, { data: documents }, { data: requirements }, { data: ddSettings }] = await Promise.all([
    supabase.from("clients").select("id, client_type, due_diligence_level").eq("id", clientId).single(),
    supabase.from("kyc_records").select("*").eq("client_id", clientId),
    supabase.from("documents").select("*").eq("client_id", clientId).eq("is_active", true),
    supabase.from("due_diligence_requirements").select("*, document_types(id, name)").order("sort_order"),
    supabase.from("due_diligence_settings").select("*"),
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

  // Auto-approve if enabled for this DD level and compliance score is 100%
  const ddLevel = ((client as unknown as Record<string, unknown>).due_diligence_level as DueDiligenceLevel) ?? "cdd";
  const levelSetting = (ddSettings ?? []).find((s) => s.level === ddLevel);
  if (levelSetting?.auto_approve && records && records.length > 0) {
    const primaryRecord = records.find((r) => r.record_type === "individual") ?? records[0];
    const score = calculateComplianceScore(
      primaryRecord as unknown as KycRecord,
      (documents ?? []) as unknown as DocumentRecord[],
      ddLevel,
      (requirements ?? []) as unknown as DueDiligenceRequirement[]
    );
    if (score.canApprove) {
      await supabase
        .from("clients")
        .update({ kyc_completed_at: now })
        .eq("id", clientId);

      await supabase.from("audit_log").insert({
        actor_id: null,
        actor_role: "system",
        action: "kyc_auto_approved",
        entity_type: "client",
        entity_id: clientId,
        detail: {
          dd_level: ddLevel,
          compliance_score: score.overallPercentage,
        },
      });
    }
  }

  revalidatePath(`/kyc`);
  return NextResponse.json({ success: true });
}
