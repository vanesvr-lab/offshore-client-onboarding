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

  const { adminId, currentManagerId, notes } = await request.json();
  if (!adminId) return NextResponse.json({ error: "adminId required" }, { status: 400 });

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  let previousManagerAdminId: string | null = null;
  if (currentManagerId) {
    const { data: prev } = await supabase
      .from("client_account_managers")
      .select("admin_id")
      .eq("id", currentManagerId)
      .maybeSingle();
    previousManagerAdminId = (prev as { admin_id?: string } | null)?.admin_id ?? null;

    const { error } = await supabase
      .from("client_account_managers")
      .update({ ended_at: now })
      .eq("id", currentManagerId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Insert the new manager record
  const { error } = await supabase.from("client_account_managers").insert({
    client_id: params.id,
    admin_id: adminId,
    started_at: now,
    ended_at: null,
    notes: notes?.trim() || null,
    assigned_by: session.user.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "account_manager_changed",
    entity_type: "client",
    entity_id: params.id,
    previous_value: { admin_id: previousManagerAdminId },
    new_value: { admin_id: adminId },
    detail: {
      previous_manager_id: previousManagerAdminId,
      new_manager_id: adminId,
    },
  });

  revalidatePath(`/admin/clients/${params.id}`);
  return NextResponse.json({ success: true });
}
