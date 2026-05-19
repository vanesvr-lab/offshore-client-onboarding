import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

// B-127 — Change role / remove admin. The `[id]` path param is the
// admin_users row id (not the underlying users.id), matching the
// pattern Vanessa described in the brief. Self-protection guards are
// applied here so a direct curl can't lock everyone out.

interface PatchBody {
  role_slug?: string;
}

async function countSuperUsers(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
): Promise<number> {
  const { data: superRole } = await supabase
    .from("admin_roles")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("slug", "super_user")
    .maybeSingle();
  if (!superRole) return 0;
  const { count } = await supabase
    .from("admin_users")
    .select("id", { count: "exact", head: true })
    .eq("role_id", superRole.id);
  return count ?? 0;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!session.user.adminPermissions?.admin_mgmt_access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: adminUserId } = await params;
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const newSlug = (body.role_slug ?? "").trim();
  if (!newSlug) {
    return NextResponse.json({ error: "role_slug is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  // Load the target admin + their current role
  const { data: target, error: targetErr } = await supabase
    .from("admin_users")
    .select("id, user_id, role_id, admin_roles!inner(id, slug, name)")
    .eq("id", adminUserId)
    .maybeSingle();
  if (targetErr) return NextResponse.json({ error: targetErr.message }, { status: 500 });
  if (!target) return NextResponse.json({ error: "Admin not found" }, { status: 404 });

  const targetRow = target as unknown as {
    id: string;
    user_id: string;
    role_id: string;
    admin_roles: { id: string; slug: string; name: string };
  };

  // Resolve new role
  const { data: newRole } = await supabase
    .from("admin_roles")
    .select("id, slug, name")
    .eq("tenant_id", tenantId)
    .eq("slug", newSlug)
    .maybeSingle();
  if (!newRole) {
    return NextResponse.json({ error: "Unknown role" }, { status: 400 });
  }

  // Self-protection — see B-127 Batch 5.
  // 1. Cannot demote the last Super User off super_user.
  if (
    targetRow.admin_roles.slug === "super_user" &&
    newRole.slug !== "super_user"
  ) {
    const supers = await countSuperUsers(supabase, tenantId);
    if (supers <= 1) {
      return NextResponse.json(
        { error: "Cannot demote the last Super User." },
        { status: 400 },
      );
    }
  }

  // 2. Cannot strip own admin_mgmt_access (self + new role lacks the flag).
  if (targetRow.user_id === session.user.id) {
    const { data: roleFlags } = await supabase
      .from("admin_roles")
      .select("admin_mgmt_access")
      .eq("id", newRole.id)
      .single();
    if (!roleFlags?.admin_mgmt_access) {
      return NextResponse.json(
        {
          error:
            "You cannot remove your own admin management access. Ask another Super User to do it.",
        },
        { status: 400 },
      );
    }
  }

  // Already on the target role? Make the call a no-op.
  if (targetRow.role_id === newRole.id) {
    return NextResponse.json({
      id: targetRow.id,
      role_id: newRole.id,
      role_slug: newRole.slug,
      role_name: newRole.name,
    });
  }

  const { error: updateErr } = await supabase
    .from("admin_users")
    .update({ role_id: newRole.id })
    .eq("id", adminUserId);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "admin_role_changed",
    entity_type: "admin_user",
    entity_id: targetRow.user_id,
    previous_value: { role_slug: targetRow.admin_roles.slug },
    new_value: { role_slug: newRole.slug },
  });

  revalidatePath("/admin/settings/admins");
  return NextResponse.json({
    id: targetRow.id,
    role_id: newRole.id,
    role_slug: newRole.slug,
    role_name: newRole.name,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!session.user.adminPermissions?.admin_mgmt_access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: adminUserId } = await params;
  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  const { data: target } = await supabase
    .from("admin_users")
    .select("id, user_id, role_id, admin_roles!inner(id, slug, name)")
    .eq("id", adminUserId)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "Admin not found" }, { status: 404 });

  const targetRow = target as unknown as {
    id: string;
    user_id: string;
    role_id: string;
    admin_roles: { id: string; slug: string; name: string };
  };

  // Self-protection — see B-127 Batch 5.
  if (targetRow.user_id === session.user.id) {
    return NextResponse.json(
      {
        error: "You cannot remove your own admin account. Ask another Super User.",
      },
      { status: 400 },
    );
  }
  if (targetRow.admin_roles.slug === "super_user") {
    const supers = await countSuperUsers(supabase, tenantId);
    if (supers <= 1) {
      return NextResponse.json(
        { error: "Cannot remove the last Super User." },
        { status: 400 },
      );
    }
  }

  const { error: delErr } = await supabase
    .from("admin_users")
    .delete()
    .eq("id", adminUserId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "admin_removed",
    entity_type: "admin_user",
    entity_id: targetRow.user_id,
    previous_value: { role_slug: targetRow.admin_roles.slug },
    new_value: null,
  });

  revalidatePath("/admin/settings/admins");
  return NextResponse.json({ success: true });
}
