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

  const { data: adminRow } = await createAdminClient()
    .from("admin_users")
    .select("user_id")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (!adminRow) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as { status: "approved" | "rejected"; note?: string };
  if (body.status !== "approved" && body.status !== "rejected") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (body.status === "rejected" && !body.note?.trim()) {
    return NextResponse.json({ error: "Rejection note is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch document to get file_name and client_id for audit log
  const { data: doc } = await supabase
    .from("documents")
    .select("id, file_name, client_id")
    .eq("id", params.id)
    .single();

  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const now = new Date().toISOString();

  await supabase
    .from("documents")
    .update({
      admin_status: body.status,
      admin_status_note: body.note ?? null,
      admin_status_by: session.user.id,
      admin_status_at: now,
    })
    .eq("id", params.id);

  // Audit log — best-effort (no application_id for library docs)
  await supabase.from("audit_log").insert({
    actor_id: session.user.id,
    actor_role: "admin",
    action: "document_reviewed",
    entity_type: "document",
    entity_id: params.id,
    detail: {
      file_name: doc.file_name,
      status: body.status,
      note: body.note ?? null,
    },
  });

  revalidatePath(`/admin/clients/${doc.client_id}/documents`);
  revalidatePath(`/admin/clients/${doc.client_id}`);

  return NextResponse.json({ success: true });
}
