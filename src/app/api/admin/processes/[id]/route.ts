import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("client_processes")
    .select(`
      *,
      process_templates(*),
      process_documents(
        *,
        document_types:process_requirements(document_types(*)),
        documents(*, document_types(*))
      )
    `)
    .eq("id", params.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ process: data });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { status, notes } = await request.json() as { status?: string; notes?: string };
  const updates: Record<string, unknown> = {};
  if (status) updates.status = status;
  if (notes !== undefined) updates.notes = notes;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch process to get client_id for revalidation + previous values for audit
  const { data: proc } = await supabase
    .from("client_processes")
    .select("client_id, status, notes")
    .eq("id", params.id)
    .single();

  const { error } = await supabase
    .from("client_processes")
    .update(updates)
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const previous: Record<string, unknown> = {};
  for (const key of Object.keys(updates)) {
    previous[key] = (proc as Record<string, unknown> | null)?.[key] ?? null;
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "process_updated",
    entity_type: "process",
    entity_id: params.id,
    previous_value: previous,
    new_value: updates,
  });

  if (proc?.client_id) revalidatePath(`/admin/clients/${proc.client_id}`);
  return NextResponse.json({ success: true });
}
