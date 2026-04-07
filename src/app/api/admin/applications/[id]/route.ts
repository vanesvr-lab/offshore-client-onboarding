import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    changes: Record<string, unknown>;
    note?: string;
  };

  const { changes, note } = body;

  if (!changes || Object.keys(changes).length === 0) {
    return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch current application
  const { data: current, error: fetchError } = await supabase
    .from("applications")
    .select("*")
    .eq("id", params.id)
    .single();

  if (fetchError || !current) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const currentRecord = current as Record<string, unknown>;

  // Determine which fields actually changed
  const changedFields: string[] = [];
  const auditInserts: Record<string, unknown>[] = [];

  for (const [field, newValue] of Object.entries(changes)) {
    const oldValue = currentRecord[field];
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changedFields.push(field);
      auditInserts.push({
        application_id: params.id,
        actor_id: session.user.id,
        actor_role: "admin",
        actor_name: session.user.name ?? null,
        action: "field_updated",
        entity_type: "application",
        entity_id: params.id,
        previous_value: { [field]: oldValue },
        new_value: { [field]: newValue },
        detail: note?.trim() ? { note: note.trim() } : null,
      });
    }
  }

  if (changedFields.length === 0) {
    return NextResponse.json({ success: true, changedFields: [] });
  }

  // Apply update
  const updateData: Record<string, unknown> = {};
  changedFields.forEach((f) => {
    updateData[f] = changes[f];
  });
  updateData.updated_at = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("applications")
    .update(updateData)
    .eq("id", params.id);

  if (updateError) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  // Write audit log entries
  if (auditInserts.length > 0) {
    await supabase.from("audit_log").insert(auditInserts);
  }

  return NextResponse.json({ success: true, changedFields });
}
