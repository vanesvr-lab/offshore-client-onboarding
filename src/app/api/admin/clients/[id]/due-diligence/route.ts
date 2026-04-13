import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import type { DueDiligenceLevel } from "@/types";

const VALID_LEVELS: DueDiligenceLevel[] = ["sdd", "cdd", "edd"];

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
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

  const body = (await request.json()) as { level: DueDiligenceLevel };
  if (!VALID_LEVELS.includes(body.level)) {
    return NextResponse.json({ error: "Invalid due diligence level" }, { status: 400 });
  }

  // Get previous level for audit log
  const { data: client } = await supabase
    .from("clients")
    .select("due_diligence_level, company_name")
    .eq("id", params.id)
    .single();

  await supabase
    .from("clients")
    .update({ due_diligence_level: body.level })
    .eq("id", params.id);

  // Audit log
  const prevLevel = (client as { due_diligence_level?: string | null } | null)?.due_diligence_level ?? null;
  if (prevLevel !== body.level) {
    await supabase.from("audit_log").insert({
      actor_id: session.user.id,
      actor_role: "admin",
      action: "due_diligence_level_changed",
      entity_type: "client",
      entity_id: params.id,
      previous_value: { level: prevLevel },
      new_value: { level: body.level },
      detail: {
        company_name: (client as { company_name?: string } | null)?.company_name,
        from: prevLevel,
        to: body.level,
      },
    });
  }

  revalidatePath(`/admin/clients/${params.id}`);

  return NextResponse.json({ success: true });
}
