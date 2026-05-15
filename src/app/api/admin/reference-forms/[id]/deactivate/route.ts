import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { note?: string };
  const note = body.note?.trim() || null;

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("reference_forms")
    .select("id, status, deactivated_reason, deactivated_note")
    .eq("id", params.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Reference form not found" }, { status: 404 });
  }

  // Idempotent: already deactivated → 200, no audit-log spam.
  if (existing.status === "deactivated") {
    return NextResponse.json({ referenceForm: existing, alreadyDeactivated: true });
  }

  const { data: updated, error } = await supabase
    .from("reference_forms")
    .update({
      status: "deactivated",
      deactivated_reason: "no_longer_required",
      deactivated_at: new Date().toISOString(),
      deactivated_note: note,
    })
    .eq("id", params.id)
    .select("*")
    .single();

  if (error || !updated) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to deactivate reference form" },
      { status: 500 },
    );
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "reference_form_deactivated",
    entity_type: "reference_form",
    entity_id: params.id,
    previous_value: { status: existing.status },
    new_value: { status: "deactivated", deactivated_reason: "no_longer_required" },
    detail: note ? { note } : null,
  });

  revalidatePath("/admin/settings/reference-forms");
  return NextResponse.json({ referenceForm: updated });
}
