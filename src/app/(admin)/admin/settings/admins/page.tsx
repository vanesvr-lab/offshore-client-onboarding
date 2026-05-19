import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { AdminsClient, type AdminRow, type RoleRow } from "./AdminsClient";

// B-127 — Admin management. Loads every admin_users row joined to its
// users + admin_roles, plus all admin_roles for the role editor. Page
// is gated on `admin_mgmt_access` — the parent `settings/layout.tsx`
// already enforces `settings_access`, but this page's flag is the
// strictest gate (the parent allows other settings pages through to
// non-mgmt admins).

export const dynamic = "force-dynamic";

export default async function AdminsSettingsPage() {
  const session = await auth();
  if (!session || session.user.role !== "admin") redirect("/login");
  if (!session.user.adminPermissions?.admin_mgmt_access) {
    redirect("/admin/dashboard");
  }

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  const [adminsResult, rolesResult] = await Promise.all([
    supabase
      .from("admin_users")
      .select(
        "id, user_id, role_id, created_at, users!inner(id, email, full_name, password_hash, last_login_at, is_active), admin_roles(id, name, slug)",
      )
      .order("created_at", { ascending: true }),
    supabase
      .from("admin_roles")
      .select(
        "id, name, slug, is_system, data_access, settings_access, admin_mgmt_access, change_status, approve_status_change, send_communications, destructive_actions, view_audit_log, export_data, can_review",
      )
      .eq("tenant_id", tenantId)
      .order("name", { ascending: true }),
  ]);

  const admins = ((adminsResult.data ?? []) as unknown as Array<{
    id: string;
    user_id: string;
    role_id: string;
    created_at: string;
    users: {
      id: string;
      email: string;
      full_name: string | null;
      password_hash: string | null;
      last_login_at: string | null;
      is_active: boolean;
    };
    admin_roles: { id: string; name: string; slug: string } | null;
  }>).map<AdminRow>((row) => ({
    id: row.id,
    user_id: row.user_id,
    email: row.users.email,
    full_name: row.users.full_name ?? row.users.email,
    last_login_at: row.users.last_login_at,
    is_active: row.users.is_active,
    has_password: !!row.users.password_hash,
    role_slug: row.admin_roles?.slug ?? "super_user",
    role_name: row.admin_roles?.name ?? "Super User",
    is_self: row.user_id === session.user.id,
  }));

  const roles = (rolesResult.data ?? []) as RoleRow[];

  return (
    <AdminsClient
      admins={admins}
      roles={roles}
      currentUserId={session.user.id}
    />
  );
}
