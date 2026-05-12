import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

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
  const { data: existing } = fields.length
    ? await supabase
        .from("service_templates")
        .select(fields.join(","))
        .eq("id", params.id)
        .maybeSingle()
    : { data: null as Record<string, unknown> | null };

  const { error } = await supabase
    .from("service_templates")
    .update(body)
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const previous: Record<string, unknown> = {};
  const before = (existing ?? null) as unknown as Record<string, unknown> | null;
  for (const key of fields) {
    previous[key] = before?.[key] ?? null;
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "service_template_updated",
    entity_type: "service_template",
    entity_id: params.id,
    previous_value: previous,
    new_value: body as Record<string, unknown>,
  });

  revalidatePath("/admin/settings/templates");
  return NextResponse.json({ success: true });
}
