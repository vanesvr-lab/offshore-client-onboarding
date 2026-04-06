import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ApplicationStatus } from "@/types";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { status, note } = await request.json() as { status: ApplicationStatus; note?: string };
  if (!status) return NextResponse.json({ error: "status is required" }, { status: 400 });

  const supabase = createAdminClient();

  const updatePayload: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "pending_action") updatePayload.admin_notes = note;
  if (status === "rejected") updatePayload.rejection_reason = note;
  if (status === "approved") updatePayload.approved_at = new Date().toISOString();
  if (status === "in_review") updatePayload.reviewed_at = new Date().toISOString();

  const { error } = await supabase
    .from("applications")
    .update(updatePayload)
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("audit_log").insert({
    application_id: params.id,
    actor_id: session.user.id,
    action: "status_changed",
    detail: { to: status, note: note || null },
  });

  return NextResponse.json({ success: true });
}
