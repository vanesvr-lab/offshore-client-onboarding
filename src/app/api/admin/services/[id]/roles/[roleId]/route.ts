import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";

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

  const { error } = await supabase
    .from("profile_service_roles")
    .update(patch)
    .eq("id", roleId)
    .eq("service_id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

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

  const { error } = await supabase
    .from("profile_service_roles")
    .delete()
    .eq("id", roleId)
    .eq("service_id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
