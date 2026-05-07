import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// B-075 — admin-status PATCH for documents reviewed inline from
// `KycLongForm` (and other surfaces that don't pass through the deep
// document review page).
//
// Accepts:
//   { status: "approved", note?: string }   — set admin_status=approved
//   { status: null }                        — revoke approval (clear fields)
//
// Approve / Revoke is intentionally narrow; full review flow (Reject + AI
// rerun + Replace) still lives on `/admin/applications/[id]/documents/[docId]`.

interface PatchBody {
  status: "approved" | null;
  note?: string | null;
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
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

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.status !== "approved" && body.status !== null) {
    return NextResponse.json(
      { error: "status must be 'approved' or null" },
      { status: 400 },
    );
  }

  // Confirm doc exists and capture client_id for revalidation + audit log.
  const { data: doc, error: fetchError } = await supabase
    .from("documents")
    .select("id, file_name, client_id")
    .eq("id", params.id)
    .single();
  if (fetchError || !doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const update =
    body.status === "approved"
      ? {
          admin_status: "approved",
          admin_status_note: body.note?.trim() || null,
          admin_status_by: session.user.id,
          admin_status_at: now,
        }
      : {
          admin_status: null,
          admin_status_note: null,
          admin_status_by: null,
          admin_status_at: null,
        };

  const { error: updateError } = await supabase
    .from("documents")
    .update(update)
    .eq("id", params.id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await supabase.from("audit_log").insert({
    actor_id: session.user.id,
    actor_role: "admin",
    action:
      body.status === "approved" ? "document_approved" : "document_approval_revoked",
    entity_type: "document",
    entity_id: params.id,
    detail: {
      file_name: doc.file_name,
      note: body.note?.trim() || null,
    },
  });

  if (doc.client_id) {
    revalidatePath(`/admin/clients/${doc.client_id}`);
  }

  return NextResponse.json({
    success: true,
    admin_status: update.admin_status,
    admin_status_note: update.admin_status_note,
    admin_status_by: update.admin_status_by,
    admin_status_at: update.admin_status_at,
  });
}
