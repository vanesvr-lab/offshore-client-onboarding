import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

/** PATCH /api/admin/services/[id]/roles/[roleId] — Update a role (can_manage, role, shareholding_percentage) */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; roleId: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, roleId } = await params;
  const body = (await request.json()) as Record<string, unknown>;

  const ALLOWED = ["can_manage", "role", "shareholding_percentage"];
  const patch: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in body) patch[key] = body[key];
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  const { data: existing } = await supabase
    .from("profile_service_roles")
    .select("role, can_manage, shareholding_percentage")
    .eq("id", roleId)
    .eq("service_id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const { error } = await supabase
    .from("profile_service_roles")
    .update(patch)
    .eq("id", roleId)
    .eq("service_id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const previous: Record<string, unknown> = {};
  if (existing) {
    const before = existing as unknown as Record<string, unknown>;
    for (const key of Object.keys(patch)) {
      previous[key] = before[key] ?? null;
    }
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "service_role_updated",
    entity_type: "service",
    entity_id: id,
    previous_value: previous,
    new_value: patch,
    detail: { role_id: roleId, changes: Object.keys(patch) },
  });

  return NextResponse.json({ ok: true });
}

/** DELETE /api/admin/services/[id]/roles/[roleId] — Remove a profile from a service */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; roleId: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, roleId } = await params;
  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  const { data: existing } = await supabase
    .from("profile_service_roles")
    .select("role, client_profile_id, can_manage, shareholding_percentage")
    .eq("id", roleId)
    .eq("service_id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const { error } = await supabase
    .from("profile_service_roles")
    .delete()
    .eq("id", roleId)
    .eq("service_id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "service_role_removed",
    entity_type: "service",
    entity_id: id,
    previous_value: (existing as Record<string, unknown> | null) ?? null,
    new_value: null,
    detail: { role_id: roleId },
  });

  return NextResponse.json({ ok: true });
}
