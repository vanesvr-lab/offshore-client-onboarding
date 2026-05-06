import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import type {
  ServiceTemplateAction,
  ServiceAction,
  ServiceActionStatus,
  ActionKey,
} from "@/types";

const VALID_STATUSES: ServiceActionStatus[] = [
  "pending",
  "in_progress",
  "done",
  "blocked",
  "not_applicable",
];

interface ActionRow {
  template_action: ServiceTemplateAction;
  instance: ServiceAction;
}

/**
 * GET /api/admin/services/[id]/actions
 * Returns the required actions for this service's template, joined with the
 * service's action statuses. Pending instances are auto-created on demand
 * for any required template action that doesn't yet have a row.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  // 1. Resolve service → template id
  const { data: service, error: svcErr } = await supabase
    .from("services")
    .select("id, service_template_id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("is_deleted", false)
    .maybeSingle();

  if (svcErr) return NextResponse.json({ error: svcErr.message }, { status: 500 });
  if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });

  const templateId = (service as { service_template_id: string }).service_template_id;

  // 2. Required actions for this template
  const { data: templateActions, error: taErr } = await supabase
    .from("service_template_actions")
    .select("*")
    .eq("service_template_id", templateId)
    .eq("tenant_id", tenantId)
    .order("sort_order");

  if (taErr) return NextResponse.json({ error: taErr.message }, { status: 500 });

  const requiredActions = (templateActions ?? []) as unknown as ServiceTemplateAction[];

  // 3. Existing instances for this service
  const { data: existingInstances, error: instErr } = await supabase
    .from("service_actions")
    .select("*")
    .eq("service_id", id)
    .eq("tenant_id", tenantId);

  if (instErr) return NextResponse.json({ error: instErr.message }, { status: 500 });

  const instanceByKey = new Map<string, ServiceAction>(
    ((existingInstances ?? []) as unknown as ServiceAction[]).map((r) => [r.action_key, r])
  );

  // 4. Auto-create pending rows for any required action without an instance
  const missing = requiredActions.filter((ta) => !instanceByKey.has(ta.action_key));
  if (missing.length > 0) {
    const inserts = missing.map((ta) => ({
      service_id: id,
      action_key: ta.action_key,
      status: "pending" as const,
      tenant_id: tenantId,
    }));
    const { data: created, error: createErr } = await supabase
      .from("service_actions")
      .insert(inserts)
      .select("*");
    if (createErr) {
      return NextResponse.json({ error: createErr.message }, { status: 500 });
    }
    for (const row of (created ?? []) as unknown as ServiceAction[]) {
      instanceByKey.set(row.action_key, row);
    }
  }

  const data: ActionRow[] = requiredActions
    .map((ta) => {
      const instance = instanceByKey.get(ta.action_key);
      if (!instance) return null;
      return { template_action: ta, instance };
    })
    .filter((x): x is ActionRow => x !== null);

  return NextResponse.json({ data });
}

interface PatchBody {
  action_key?: ActionKey | string;
  status?: ServiceActionStatus | string;
  notes?: string | null;
  assigned_to?: string | null;
}

/**
 * PATCH /api/admin/services/[id]/actions
 * Updates a single service_actions row keyed by action_key. Inserts the
 * row if it doesn't exist (so the caller doesn't have to GET first).
 * When status transitions to "done", sets completed_by + completed_at.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const actionKey = typeof body.action_key === "string" ? body.action_key.trim() : "";
  if (!actionKey) {
    return NextResponse.json({ error: "action_key is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  // Read current row (if any) to detect "transition to done"
  const { data: existing, error: readErr } = await supabase
    .from("service_actions")
    .select("*")
    .eq("service_id", id)
    .eq("action_key", actionKey)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

  const previousStatus = (existing as { status?: string } | null)?.status ?? null;
  const nowIso = new Date().toISOString();

  const patch: Record<string, unknown> = { updated_at: nowIso };

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status as ServiceActionStatus)) {
      return NextResponse.json(
        { error: `status must be one of ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    patch.status = body.status;
    if (body.status === "done" && previousStatus !== "done") {
      patch.completed_by = session.user.id;
      patch.completed_at = nowIso;
    }
    if (body.status !== "done" && previousStatus === "done") {
      // Reverting from done → clear audit so a future done doesn't lie
      patch.completed_by = null;
      patch.completed_at = null;
    }
  }

  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.assigned_to !== undefined) patch.assigned_to = body.assigned_to;

  if (existing) {
    const { data, error } = await supabase
      .from("service_actions")
      .update(patch)
      .eq("id", (existing as { id: string }).id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data as unknown as ServiceAction });
  }

  // Insert if missing — first call may PATCH before GET autofill ran
  const insert: Record<string, unknown> = {
    service_id: id,
    action_key: actionKey,
    status: (patch.status as ServiceActionStatus | undefined) ?? "pending",
    notes: (patch.notes as string | null | undefined) ?? null,
    assigned_to: (patch.assigned_to as string | null | undefined) ?? null,
    tenant_id: tenantId,
  };
  if (insert.status === "done") {
    insert.completed_by = session.user.id;
    insert.completed_at = nowIso;
  }

  const { data, error } = await supabase
    .from("service_actions")
    .insert(insert)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data as unknown as ServiceAction });
}
