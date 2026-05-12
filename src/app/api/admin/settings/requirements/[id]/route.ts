import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("document_requirements")
    .select("template_id, name, category, is_required")
    .eq("id", params.id)
    .maybeSingle();

  const { error } = await supabase
    .from("document_requirements")
    .delete()
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const templateId =
    (existing as { template_id?: string } | null)?.template_id ?? null;

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "template_requirement_removed",
    entity_type: "service_template",
    entity_id: templateId,
    previous_value: (existing as Record<string, unknown> | null) ?? null,
    new_value: null,
    detail: { requirement_id: params.id },
  });

  revalidatePath("/admin/settings/templates");
  revalidatePath("/admin/settings/rules");
  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json();
  const supabase = createAdminClient();

  const fields = Object.keys(body as Record<string, unknown>);
  const selectCols = [...fields, "template_id"].join(",");
  const { data: existing } = await supabase
    .from("document_requirements")
    .select(selectCols)
    .eq("id", params.id)
    .maybeSingle();

  const { error } = await supabase
    .from("document_requirements")
    .update(body)
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const previous: Record<string, unknown> = {};
  const before = (existing ?? null) as unknown as Record<string, unknown> | null;
  for (const key of fields) {
    previous[key] = before?.[key] ?? null;
  }
  const templateId =
    (before?.template_id as string | undefined) ?? null;

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "template_requirement_updated",
    entity_type: "service_template",
    entity_id: templateId,
    previous_value: previous,
    new_value: body as Record<string, unknown>,
    detail: { requirement_id: params.id },
  });

  revalidatePath("/admin/settings/templates");
  revalidatePath("/admin/settings/rules");
  return NextResponse.json({ success: true });
}
