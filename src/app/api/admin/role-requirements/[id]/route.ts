import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

/** DELETE /api/admin/role-requirements/[id] — Remove a role document requirement */
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
    .from("role_document_requirements")
    .select("role, document_type_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("role_document_requirements")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "role_requirement_deleted",
    entity_type: "role_requirement",
    entity_id: id,
    previous_value: (existing as Record<string, unknown> | null) ?? null,
    new_value: null,
  });

  return NextResponse.json({ ok: true });
}
