import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";

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
  ];
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ALLOWED) {
    if (key in body) patch[key] = body[key];
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

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
