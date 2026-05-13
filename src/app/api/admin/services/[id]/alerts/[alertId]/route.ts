// B-108 Batch 3 — Resolve a manual service alert.
//
// PATCH /api/admin/services/[id]/alerts/[alertId]
//   body: { status: 'resolved' }
//   sets status='resolved' + resolved_at/resolved_by, audit-logs
//   `service_alert_resolved`. Only manual alerts can be resolved; auto
//   alerts are dismissed via the sibling /dismiss-auto route instead.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

interface PatchBody {
  status?: unknown;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; alertId: string }> },
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: serviceId, alertId } = await params;
  const body = (await request.json().catch(() => ({}))) as PatchBody;

  if (body.status !== "resolved") {
    return NextResponse.json(
      { error: "Only status='resolved' is supported on this endpoint" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  const resolvedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("service_alerts")
    .update({
      status: "resolved",
      resolved_at: resolvedAt,
      resolved_by: session.user.id,
    })
    .eq("id", alertId)
    .eq("service_id", serviceId)
    .eq("tenant_id", tenantId)
    .select("id, severity, title, note, status, created_at, created_by, resolved_at, resolved_by")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Alert not found" },
      { status: 404 },
    );
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "service_alert_resolved",
    entity_type: "service",
    entity_id: serviceId,
    previous_value: null,
    new_value: { alert_id: data.id, resolved_at: resolvedAt },
    detail: { title: data.title },
  });

  return NextResponse.json({ ok: true, alert: data });
}
