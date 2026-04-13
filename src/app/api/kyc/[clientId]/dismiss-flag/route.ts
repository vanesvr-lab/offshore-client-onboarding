import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RiskFlag } from "@/types";

export async function POST(
  request: Request,
  { params }: { params: { clientId: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createAdminClient();

  // Admin only
  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (!adminRow) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as { kycRecordId: string; flagType: string; reason: string };
  if (!body.kycRecordId || !body.flagType || !body.reason?.trim()) {
    return NextResponse.json({ error: "kycRecordId, flagType, and reason are required" }, { status: 400 });
  }

  const { data: record, error: fetchErr } = await supabase
    .from("kyc_records")
    .select("id, risk_flags, client_id")
    .eq("id", body.kycRecordId)
    .eq("client_id", params.clientId)
    .single();

  if (fetchErr || !record) {
    return NextResponse.json({ error: fetchErr?.message ?? "Record not found" }, { status: 404 });
  }

  const existing = (record.risk_flags ?? []) as RiskFlag[];
  const updated = existing.map((f) =>
    f.type === body.flagType
      ? { ...f, dismissed: true, dismissedReason: body.reason.trim() }
      : f
  );

  const { error: updateErr } = await supabase
    .from("kyc_records")
    .update({ risk_flags: updated, updated_at: new Date().toISOString() })
    .eq("id", body.kycRecordId);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  await supabase.from("audit_log").insert({
    actor_id: session.user.id,
    actor_role: "admin",
    action: "risk_flag_dismissed",
    entity_type: "kyc_record",
    entity_id: body.kycRecordId,
    detail: {
      flag_type: body.flagType,
      reason: body.reason.trim(),
      client_id: params.clientId,
    },
  });

  return NextResponse.json({ success: true, flags: updated });
}
