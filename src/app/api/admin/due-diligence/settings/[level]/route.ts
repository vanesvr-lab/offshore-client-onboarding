import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

export async function PATCH(
  request: Request,
  { params }: { params: { level: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createAdminClient();
  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (!adminRow) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json() as Record<string, unknown>;

  // Only allow patching known safe columns
  const allowed = ["auto_approve", "requires_senior_approval", "label", "description"];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("due_diligence_settings")
    .select(allowed.join(","))
    .eq("level", params.level)
    .maybeSingle();

  const { error } = await supabase
    .from("due_diligence_settings")
    .update(update)
    .eq("level", params.level);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const previous: Record<string, unknown> = {};
  const before = (existing ?? null) as unknown as Record<string, unknown> | null;
  for (const key of Object.keys(update)) {
    previous[key] = before?.[key] ?? null;
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "dd_settings_updated",
    entity_type: "due_diligence_settings",
    entity_id: null,
    previous_value: previous,
    new_value: update,
    detail: { level: params.level },
  });

  return NextResponse.json({ success: true });
}
