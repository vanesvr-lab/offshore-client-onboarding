import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

/** DELETE /api/admin/profiles/[id]/requirement-overrides/[reqId] — Reinstate a DD requirement */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; reqId: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = getTenantId(session);
  const { id: profileId, reqId: requirementId } = await params;

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("profile_requirement_overrides")
    .delete()
    .eq("client_profile_id", profileId)
    .eq("requirement_id", requirementId)
    .eq("tenant_id", tenantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "requirement_override_removed",
    entity_type: "client_profile",
    entity_id: profileId,
    previous_value: { requirement_id: requirementId },
    new_value: null,
  });

  return NextResponse.json({ ok: true });
}
