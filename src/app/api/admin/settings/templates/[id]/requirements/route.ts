import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { name, description, category, is_required, sort_order } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: created, error } = await supabase
    .from("document_requirements")
    .insert({
      template_id: params.id,
      name: name.trim(),
      description: description || null,
      category,
      is_required: is_required ?? true,
      sort_order: sort_order ?? 1,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "template_requirement_added",
    entity_type: "service_template",
    entity_id: params.id,
    previous_value: null,
    new_value: {
      requirement_id: created.id,
      name: name.trim(),
      category,
      is_required: is_required ?? true,
    },
  });

  revalidatePath("/admin/settings/templates");
  revalidatePath("/admin/settings/rules");
  return NextResponse.json({ success: true });
}
