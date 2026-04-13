import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createAdminClient();
  const { data: adminRow } = await supabase
    .from("admin_users").select("user_id").eq("user_id", session.user.id).maybeSingle();
  if (!adminRow) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as {
    email?: string | null;
    due_diligence_level?: string | null;
  };

  const allowed = ["email", "due_diligence_level"];
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) update[key] = (body as Record<string, unknown>)[key];
  }

  const { data: current } = await supabase
    .from("kyc_records")
    .select("client_id, due_diligence_level, email")
    .eq("id", params.id)
    .maybeSingle();

  const { data: updated, error } = await supabase
    .from("kyc_records")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit log for DD level change
  if ("due_diligence_level" in body && body.due_diligence_level !== (current as Record<string, unknown> | null)?.due_diligence_level) {
    await supabase.from("audit_log").insert({
      actor_id: session.user.id,
      actor_role: "admin",
      action: "profile_dd_level_changed",
      entity_type: "kyc_record",
      entity_id: params.id,
      previous_value: { due_diligence_level: (current as Record<string, unknown> | null)?.due_diligence_level },
      new_value: { due_diligence_level: body.due_diligence_level },
      detail: { client_id: (current as Record<string, unknown> | null)?.client_id },
    });
  }

  const clientId = (current as Record<string, unknown> | null)?.client_id as string | undefined;
  if (clientId) revalidatePath(`/admin/clients/${clientId}`);

  return NextResponse.json({ record: updated });
}
