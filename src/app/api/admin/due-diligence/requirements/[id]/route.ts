import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

/** DELETE /api/admin/due-diligence/requirements/[id] — Remove a DD requirement */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("due_diligence_requirements")
    .select("level, requirement_type, label")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("due_diligence_requirements")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "dd_requirement_deleted",
    entity_type: "due_diligence_requirement",
    entity_id: id,
    previous_value: (existing as Record<string, unknown> | null) ?? null,
    new_value: null,
  });

  return NextResponse.json({ ok: true });
}
