// B-108 Batch 3 — Create a manual service alert.
//
// POST /api/admin/services/[id]/alerts
//   body: { title: string, note?: string, severity: 'info'|'warning'|'critical' }
//   inserts an open row in `service_alerts`, audit-logs
//   `service_alert_created`.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

const SEVERITIES = ["info", "warning", "critical"] as const;
type Severity = (typeof SEVERITIES)[number];

interface CreateBody {
  title?: unknown;
  note?: unknown;
  severity?: unknown;
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
  const body = (await request.json().catch(() => ({}))) as CreateBody;

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
  const severity = (typeof body.severity === "string" ? body.severity : "") as Severity;

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!SEVERITIES.includes(severity)) {
    return NextResponse.json(
      { error: "severity must be 'info', 'warning', or 'critical'" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  const { data, error } = await supabase
    .from("service_alerts")
    .insert({
      service_id: serviceId,
      tenant_id: tenantId,
      severity,
      title,
      note,
      status: "open",
      created_by: session.user.id,
    })
    .select("id, severity, title, note, status, created_at, created_by, resolved_at, resolved_by")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Insert failed" },
      { status: 500 },
    );
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "service_alert_created",
    entity_type: "service",
    entity_id: serviceId,
    previous_value: null,
    new_value: { alert_id: data.id, severity, title },
    detail: { note },
  });

  return NextResponse.json({ ok: true, alert: data });
}
