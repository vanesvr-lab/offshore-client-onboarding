import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { isValidServiceStatus, SERVICE_STATUS_ALL } from "@/lib/services/statusChain";
import { hasDataAccess } from "@/lib/admin-permissions";

/** PATCH /api/admin/services/[id] — Update service fields */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;

  // Allowlist of patchable fields
  const ALLOWED = [
    "status", "service_details",
    "loe_received", "loe_received_at",
    "invoice_sent_at", "payment_received_at",
    // B-130 — service officer assignment. Has its own data_access=edit
    // gate below; the audit trigger on services logs every change.
    "assigned_admin_id",
  ];
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ALLOWED) {
    if (key in body) patch[key] = body[key];
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // B-098 — guard against status values outside the canonical chain so a
  // malformed client never reaches the DB CHECK constraint with a 500.
  if ("status" in patch) {
    const candidate = patch.status;
    if (typeof candidate !== "string" || !isValidServiceStatus(candidate)) {
      return NextResponse.json(
        { error: `status must be one of: ${SERVICE_STATUS_ALL.join(", ")}` },
        { status: 400 },
      );
    }
    // B-127 — committing a status transition (forward or override) requires
    // approve_status_change. A `change_status`-only role can see the button
    // but the UI renders it disabled with a tooltip; if a curl bypasses
    // the UI, this 403 catches it.
    if (!session.user.adminPermissions?.approve_status_change) {
      return NextResponse.json(
        { error: "Your role doesn't have permission to commit a status change." },
        { status: 403 },
      );
    }
  }

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  // B-130 — assignment changes require data_access=edit (Super User /
  // Manager / Officer by default; Junior Officer + Auditor are
  // 'view'-only and can't assign). Validate the target user is an
  // actual admin so a malformed body can't park a random user_id on
  // the FK.
  if ("assigned_admin_id" in patch) {
    if (!hasDataAccess(session.user.adminPermissions, "edit")) {
      return NextResponse.json(
        { error: "Your role can't assign or reassign services." },
        { status: 403 },
      );
    }
    const next = patch.assigned_admin_id;
    if (next !== null && typeof next !== "string") {
      return NextResponse.json(
        { error: "assigned_admin_id must be a user id or null" },
        { status: 400 },
      );
    }
    if (typeof next === "string") {
      const { data: adminRow } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", next)
        .maybeSingle();
      if (!adminRow) {
        return NextResponse.json(
          { error: "Target user is not an admin." },
          { status: 400 },
        );
      }
    }
  }

  // B-093 — capture the previous status before applying the patch so we can
  // write a status_changed audit_log row when status moves. The right-rail
  // Status card reads the latest such row to render the "Status updated on
  // <date> by <name>" line.
  let previousStatus: string | null = null;
  if ("status" in patch) {
    const { data: existing } = await supabase
      .from("services")
      .select("status")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .eq("is_deleted", false)
      .maybeSingle();
    previousStatus = (existing as { status: string } | null)?.status ?? null;
  }

  const { error } = await supabase
    .from("services")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("is_deleted", false);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if ("status" in patch && previousStatus !== patch.status) {
    // B-094 — use session.user.name from the NextAuth JWT (already set in
    // src/lib/auth.ts) instead of a separate users-table lookup. Saves one
    // round-trip per status change and stays correct even when
    // users.full_name is null but the session has an email fallback.
    const { error: auditError } = await supabase.from("audit_log").insert({
      actor_id: session.user.id,
      actor_role: "admin",
      actor_name: session.user.name ?? session.user.email ?? "Unknown user",
      action: "status_changed",
      entity_type: "service",
      entity_id: id,
      previous_value: { status: previousStatus },
      new_value: { status: patch.status as string },
    });
    if (auditError) {
      console.error("[audit_log] service status_changed insert failed", auditError);
    }
  }

  return NextResponse.json({ ok: true });
}
