import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";

// B-125 — CSV export of a service's audit_log entries. Mirrors the
// shape used by `loadServiceDetail.ts` (entity_type=service, entity_id=
// service id) and accepts optional `from` / `to` ISO date params so the
// download honours the date-range preset selected in the Audit Trail
// card. Columns mirror the audit_log row shape with previous_value /
// new_value / detail serialised as JSON-in-CSV-cell.

const COLUMNS = [
  "timestamp",
  "actor_name",
  "actor_role",
  "entity_type",
  "entity_id",
  "action",
  "note",
  "previous_value",
  "new_value",
] as const;

interface AuditRow {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: "client" | "admin" | "system" | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  detail: Record<string, unknown> | null;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  // Only quote when the cell would otherwise break a row. Quotes inside
  // a quoted cell are doubled per RFC 4180.
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function rowToCsv(row: AuditRow): string {
  // The Audit Trail UI extracts the `note` from `detail.note` for
  // `status_changed` entries; replicate that here so the CSV's note
  // column is consistent with what admin sees on screen. For other
  // actions, the note is null/empty.
  const note =
    row.action === "status_changed" && row.detail
      ? ((row.detail as Record<string, unknown>).note as string | null) ?? ""
      : "";

  const cells = [
    row.created_at,
    row.actor_name ?? "",
    row.actor_role ?? "",
    row.entity_type ?? "",
    row.entity_id ?? "",
    row.action,
    note,
    row.previous_value,
    row.new_value,
  ];
  return cells.map(csvEscape).join(",");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const url = new URL(request.url);
  const fromIso = url.searchParams.get("from");
  const toIso = url.searchParams.get("to");

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  // Confirm service exists in tenant — same guard as the substance PUT
  // endpoint. Avoids leaking audit_log entries across tenants if entity
  // ids collide (UUID v4 makes this astronomically unlikely but the
  // explicit check costs ~1ms and keeps the contract clean).
  const { data: service, error: svcErr } = await supabase
    .from("services")
    .select("id, service_number")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (svcErr) {
    return NextResponse.json({ error: svcErr.message }, { status: 500 });
  }
  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  let q = supabase
    .from("audit_log")
    .select(
      "id, created_at, actor_id, actor_name, actor_role, action, entity_type, entity_id, previous_value, new_value, detail",
    )
    .eq("entity_type", "service")
    .eq("entity_id", id)
    .order("created_at", { ascending: false });

  if (fromIso) q = q.gte("created_at", fromIso);
  if (toIso) q = q.lte("created_at", toIso);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as AuditRow[];
  const header = COLUMNS.join(",");
  const body = rows.map(rowToCsv).join("\n");
  const csv = body ? `${header}\n${body}\n` : `${header}\n`;

  const today = new Date().toISOString().slice(0, 10);
  const filename = `audit-${(service as { service_number?: string | null }).service_number ?? id}-${today}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
