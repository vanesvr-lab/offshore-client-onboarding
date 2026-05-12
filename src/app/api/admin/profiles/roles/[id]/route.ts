import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createAdminClient();
  const { data: adminRow } = await supabase
    .from("admin_users").select("user_id").eq("user_id", session.user.id).maybeSingle();
  if (!adminRow) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: existing } = await supabase
    .from("profile_roles")
    .select("kyc_record_id, role, shareholding_percentage")
    .eq("id", params.id)
    .maybeSingle();

  const { error } = await supabase
    .from("profile_roles")
    .delete()
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const entityId =
    (existing as { kyc_record_id?: string } | null)?.kyc_record_id ?? null;

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "profile_role_removed",
    entity_type: "client_profile",
    entity_id: entityId,
    previous_value: (existing as Record<string, unknown> | null) ?? null,
    new_value: null,
    detail: { role_id: params.id },
  });

  return NextResponse.json({ success: true });
}
