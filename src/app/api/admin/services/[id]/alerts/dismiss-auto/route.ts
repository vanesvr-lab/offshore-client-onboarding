// B-108 Batch 3 — Dismiss an auto alert.
//
// POST /api/admin/services/[id]/alerts/dismiss-auto
//   body: { auto_alert_key: string }
//   upserts a row into `dismissed_auto_alerts` keyed on
//   (service_id, auto_alert_key). Audit-logs `auto_alert_dismissed`.
//   Idempotent — a duplicate dismissal returns the existing row.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

interface Body {
  auto_alert_key?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: serviceId } = await params;
  const body = (await request.json().catch(() => ({}))) as Body;
  const key = typeof body.auto_alert_key === "string" ? body.auto_alert_key.trim() : "";

  if (!key) {
    return NextResponse.json({ error: "auto_alert_key is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  // Idempotent: lookup first, insert only if missing. The UNIQUE
  // constraint on (service_id, auto_alert_key) would also reject a
  // duplicate, but the lookup keeps the response shape stable.
  const { data: existing } = await supabase
    .from("dismissed_auto_alerts")
    .select("auto_alert_key, dismissed_at, dismissed_by")
    .eq("service_id", serviceId)
    .eq("auto_alert_key", key)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  let row = existing;
  if (!row) {
    const { data: inserted, error } = await supabase
      .from("dismissed_auto_alerts")
      .insert({
        service_id: serviceId,
        tenant_id: tenantId,
        auto_alert_key: key,
        dismissed_by: session.user.id,
      })
      .select("auto_alert_key, dismissed_at, dismissed_by")
      .single();
    if (error || !inserted) {
      return NextResponse.json(
        { error: error?.message ?? "Insert failed" },
        { status: 500 },
      );
    }
    row = inserted;

    await writeAuditLog(supabase, {
      actor_id: session.user.id,
      actor_role: "admin",
      actor_name: session.user.name ?? session.user.email ?? "Unknown user",
      action: "auto_alert_dismissed",
      entity_type: "service",
      entity_id: serviceId,
      previous_value: null,
      new_value: { auto_alert_key: key },
      detail: null,
    });
  }

  return NextResponse.json({ ok: true, dismissal: row });
}
