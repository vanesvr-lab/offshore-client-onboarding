import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";

// B-127 — Toggle one or more permission flags on a role. Body is a
// partial of the 10 columns (`settings_access` / `admin_mgmt_access` /
// `data_access` / `change_status` / `approve_status_change` /
// `send_communications` / `destructive_actions` / `view_audit_log` /
// `export_data` / `can_review`). Anything else in the body is
// ignored. Audit-logged automatically by the
// `admin_role_change_audit` trigger (see B-127 Batch 1 migration).
//
// Self-protection: `admin_mgmt_access` cannot be disabled on the
// `super_user` role — otherwise the last Super User could lock
// everyone out of admin management.

const BOOLEAN_FIELDS = [
  "settings_access",
  "admin_mgmt_access",
  "change_status",
  "approve_status_change",
  "send_communications",
  "destructive_actions",
  "view_audit_log",
  "export_data",
  "can_review",
] as const;

const DATA_ACCESS_VALUES = ["none", "view", "edit"] as const;
type DataAccessValue = (typeof DATA_ACCESS_VALUES)[number];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!session.user.adminPermissions?.admin_mgmt_access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { slug } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  // Build allow-listed patch
  const patch: Record<string, unknown> = {};
  for (const field of BOOLEAN_FIELDS) {
    if (field in body) {
      if (typeof body[field] !== "boolean") {
        return NextResponse.json(
          { error: `${field} must be a boolean` },
          { status: 400 },
        );
      }
      patch[field] = body[field];
    }
  }
  if ("data_access" in body) {
    const v = body.data_access;
    if (typeof v !== "string" || !DATA_ACCESS_VALUES.includes(v as DataAccessValue)) {
      return NextResponse.json(
        { error: "data_access must be 'none', 'view', or 'edit'" },
        { status: 400 },
      );
    }
    patch.data_access = v;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No editable fields in body" }, { status: 400 });
  }

  // Self-protection: cannot disable admin_mgmt_access on super_user.
  if (slug === "super_user" && patch.admin_mgmt_access === false) {
    return NextResponse.json(
      { error: "admin_mgmt_access cannot be disabled on the Super User role." },
      { status: 400 },
    );
  }

  patch.updated_at = new Date().toISOString();

  const { data: updated, error } = await supabase
    .from("admin_roles")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("slug", slug)
    .select("*")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  // The `admin_role_change_audit` DB trigger writes one audit_log row
  // per UPDATE — no need to call writeAuditLog here.

  revalidatePath("/admin/settings/admins");
  return NextResponse.json({ data: updated });
}
