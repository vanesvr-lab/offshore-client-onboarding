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
//   { expiry_date: string | null }          — B-097 manual override / clear
//
// Approve / Revoke is intentionally narrow; full review flow (Reject + AI
// rerun + Replace) still lives on `/admin/applications/[id]/documents/[docId]`.

interface PatchBody {
  status?: "approved" | null;
  note?: string | null;
  /** B-097 — manual expiry override; `null` clears it back to the type rule. */
  expiry_date?: string | null;
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

  const hasStatus = "status" in body;
  const hasExpiry = "expiry_date" in body;

  if (!hasStatus && !hasExpiry) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  if (hasStatus && body.status !== "approved" && body.status !== null) {
    return NextResponse.json(
      { error: "status must be 'approved' or null" },
      { status: 400 },
    );
  }

  // Validate expiry_date shape if present: null or ISO-ish date string.
  if (hasExpiry && body.expiry_date !== null) {
    if (typeof body.expiry_date !== "string" || isNaN(Date.parse(body.expiry_date))) {
      return NextResponse.json(
        { error: "expiry_date must be an ISO date or null" },
        { status: 400 },
      );
    }
  }

  // Confirm doc exists and capture client_id + file_name for audit log.
  const { data: doc, error: fetchError } = await supabase
    .from("documents")
    .select("id, file_name, client_id, expiry_date")
    .eq("id", params.id)
    .single();
  if (fetchError || !doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {};

  if (hasStatus) {
    if (body.status === "approved") {
      update.admin_status = "approved";
      update.admin_status_note = body.note?.trim() || null;
      update.admin_status_by = session.user.id;
      update.admin_status_at = now;
    } else {
      update.admin_status = null;
      update.admin_status_note = null;
      update.admin_status_by = null;
      update.admin_status_at = null;
    }
  }

  if (hasExpiry) {
    update.expiry_date = body.expiry_date ?? null;
  }

  const { error: updateError } = await supabase
    .from("documents")
    .update(update)
    .eq("id", params.id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (hasStatus) {
    await supabase.from("audit_log").insert({
      actor_id: session.user.id,
      actor_role: "admin",
      actor_name: session.user.name ?? session.user.email ?? "Unknown user",
      action:
        body.status === "approved" ? "document_approved" : "document_approval_revoked",
      entity_type: "document",
      entity_id: params.id,
      detail: {
        file_name: doc.file_name,
        note: body.note?.trim() || null,
      },
    });
  }

  // B-097 — only audit expiry change if value actually changed.
  if (hasExpiry && (body.expiry_date ?? null) !== (doc.expiry_date ?? null)) {
    await supabase.from("audit_log").insert({
      actor_id: session.user.id,
      actor_role: "admin",
      actor_name: session.user.name ?? session.user.email ?? "Unknown user",
      action: "document_expiry_updated",
      entity_type: "document",
      entity_id: params.id,
      previous_value: { expiry_date: doc.expiry_date },
      new_value: { expiry_date: body.expiry_date ?? null },
      detail: { file_name: doc.file_name },
    });
  }

  if (doc.client_id) {
    revalidatePath(`/admin/clients/${doc.client_id}`);
  }

  return NextResponse.json({
    success: true,
    ...(hasStatus ? {
      admin_status: update.admin_status,
      admin_status_note: update.admin_status_note,
      admin_status_by: update.admin_status_by,
      admin_status_at: update.admin_status_at,
    } : {}),
    ...(hasExpiry ? { expiry_date: update.expiry_date } : {}),
  });
}
