import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { applicationId, clientId, templateId, ...fields } = body;

  const supabase = createAdminClient();
  const payload = {
    ...fields,
    template_id: templateId,
    client_id: clientId,
    status: "draft",
    updated_at: new Date().toISOString(),
  };

  const actorName = session.user.name ?? session.user.email ?? "Unknown user";

  if (applicationId) {
    const { error } = await supabase.from("applications").update(payload).eq("id", applicationId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAuditLog(supabase, {
      actor_id: session.user.id,
      actor_role: "admin",
      actor_name: actorName,
      action: "application_upserted",
      entity_type: "application",
      entity_id: applicationId,
      previous_value: null,
      new_value: {
        template_id: templateId,
        client_id: clientId,
        operation: "update",
      },
    });

    revalidatePath("/admin/applications");
    revalidatePath("/admin/dashboard");
    return NextResponse.json({ applicationId });
  } else {
    const { data, error } = await supabase.from("applications").insert(payload).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAuditLog(supabase, {
      actor_id: session.user.id,
      actor_role: "admin",
      actor_name: actorName,
      action: "application_upserted",
      entity_type: "application",
      entity_id: data.id,
      previous_value: null,
      new_value: {
        id: data.id,
        template_id: templateId,
        client_id: clientId,
        operation: "insert",
      },
    });

    revalidatePath("/admin/applications");
    revalidatePath("/admin/dashboard");
    return NextResponse.json({ applicationId: data.id });
  }
}
