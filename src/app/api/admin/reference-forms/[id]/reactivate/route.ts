import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("reference_forms")
    .select("id, status, replaced_by_id, deactivated_reason")
    .eq("id", params.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Reference form not found" }, { status: 404 });
  }
  if (existing.status === "active") {
    return NextResponse.json({ referenceForm: existing, alreadyActive: true });
  }
  if (existing.replaced_by_id) {
    return NextResponse.json(
      { error: "This form was replaced by a newer version. Reactivate the newer version instead." },
      { status: 409 },
    );
  }

  const { data: updated, error } = await supabase
    .from("reference_forms")
    .update({
      status: "active",
      deactivated_reason: null,
      deactivated_at: null,
      deactivated_note: null,
    })
    .eq("id", params.id)
    .select("*")
    .single();

  if (error || !updated) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to reactivate reference form" },
      { status: 500 },
    );
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "reference_form_reactivated",
    entity_type: "reference_form",
    entity_id: params.id,
    previous_value: {
      status: existing.status,
      deactivated_reason: existing.deactivated_reason,
    },
    new_value: { status: "active" },
  });

  revalidatePath("/admin/settings/reference-forms");
  return NextResponse.json({ referenceForm: updated });
}
