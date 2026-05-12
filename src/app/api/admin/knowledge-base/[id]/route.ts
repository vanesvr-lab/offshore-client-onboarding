import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

// PATCH /api/admin/knowledge-base/[id] — update an entry
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const allowed = ["title", "category", "content", "applies_to", "source", "is_active"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }
  updates.updated_at = new Date().toISOString();

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("knowledge_base")
    .select(allowed.join(","))
    .eq("id", params.id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("knowledge_base")
    .update(updates)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const previous: Record<string, unknown> = {};
  const before = (existing ?? null) as unknown as Record<string, unknown> | null;
  for (const key of Object.keys(updates)) {
    if (key === "updated_at") continue;
    previous[key] = before?.[key] ?? null;
  }
  const newValue: Record<string, unknown> = { ...updates };
  delete newValue.updated_at;

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "kb_entry_updated",
    entity_type: "kb_entry",
    entity_id: params.id,
    previous_value: previous,
    new_value: newValue,
  });

  revalidatePath("/admin/settings/knowledge-base");
  return NextResponse.json({ entry: data });
}

// DELETE /api/admin/knowledge-base/[id] — delete an entry
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("knowledge_base")
    .select("id, title, category")
    .eq("id", params.id)
    .maybeSingle();

  const { error } = await supabase
    .from("knowledge_base")
    .delete()
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "kb_entry_deleted",
    entity_type: "kb_entry",
    entity_id: params.id,
    previous_value: (existing as Record<string, unknown> | null) ?? null,
    new_value: null,
  });

  revalidatePath("/admin/settings/knowledge-base");
  return NextResponse.json({ success: true });
}
