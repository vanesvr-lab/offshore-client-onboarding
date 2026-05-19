// B-127 — Resolve the active admin's permission set. Loaded once at
// login and cached on the NextAuth JWT so every server route + RSC can
// reach `session.user.adminPermissions` without a per-request DB hit.
// Refreshed naturally on the next login; mid-session permission edits
// take effect after the admin signs out + back in (acceptable for now —
// the alternative is a per-request DB hit which we'll only pay for if a
// faster refresh becomes a real need).

import type { SupabaseClient } from "@supabase/supabase-js";

export type DataAccess = "none" | "view" | "edit";

// 9 boolean flags. The 10th permission (`data_access`) is tri-state and
// has its own helper `hasDataAccess` below.
export type PermissionFlag =
  | "settings_access"
  | "admin_mgmt_access"
  | "change_status"
  | "approve_status_change"
  | "send_communications"
  | "destructive_actions"
  | "view_audit_log"
  | "export_data"
  | "can_review";

export interface AdminPermissions {
  role_id: string;
  role_name: string;
  role_slug: string;
  data_access: DataAccess;
  settings_access: boolean;
  admin_mgmt_access: boolean;
  change_status: boolean;
  approve_status_change: boolean;
  send_communications: boolean;
  destructive_actions: boolean;
  view_audit_log: boolean;
  export_data: boolean;
  can_review: boolean;
}

interface AdminUserRoleRow {
  admin_roles: {
    id: string;
    name: string;
    slug: string;
    data_access: DataAccess;
    settings_access: boolean;
    admin_mgmt_access: boolean;
    change_status: boolean;
    approve_status_change: boolean;
    send_communications: boolean;
    destructive_actions: boolean;
    view_audit_log: boolean;
    export_data: boolean;
    can_review: boolean;
  } | null;
}

// Load the active admin's role + permission flags. Returns null if the
// user is not in `admin_users` or has no role assigned (the migration
// backfills every existing admin to Super User, so a null result on a
// post-B-127 system means "not an admin").
export async function loadAdminPermissions(
  supabase: SupabaseClient,
  userId: string,
): Promise<AdminPermissions | null> {
  const { data, error } = await supabase
    .from("admin_users")
    .select(
      "admin_roles!inner(id, name, slug, data_access, settings_access, admin_mgmt_access, change_status, approve_status_change, send_communications, destructive_actions, view_audit_log, export_data, can_review)",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  const role = (data as unknown as AdminUserRoleRow).admin_roles;
  if (!role) return null;

  return {
    role_id: role.id,
    role_name: role.name,
    role_slug: role.slug,
    data_access: role.data_access,
    settings_access: role.settings_access,
    admin_mgmt_access: role.admin_mgmt_access,
    change_status: role.change_status,
    approve_status_change: role.approve_status_change,
    send_communications: role.send_communications,
    destructive_actions: role.destructive_actions,
    view_audit_log: role.view_audit_log,
    export_data: role.export_data,
    can_review: role.can_review,
  };
}

// Boolean-flag check. Returns false for null / undefined permissions
// (i.e. callers pass `session.user.adminPermissions` directly without
// having to null-guard at every call site).
export function hasFlag(
  perms: AdminPermissions | null | undefined,
  flag: PermissionFlag,
): boolean {
  return !!perms?.[flag];
}

// Tri-state `data_access` check. `level` is the minimum required:
//   "none" → always true (every admin can do "none-level" work).
//   "view" → true when data_access is 'view' or 'edit'.
//   "edit" → true only when data_access is 'edit'.
export function hasDataAccess(
  perms: AdminPermissions | null | undefined,
  level: DataAccess,
): boolean {
  if (level === "none") return true;
  if (!perms) return false;
  if (level === "view") {
    return perms.data_access === "view" || perms.data_access === "edit";
  }
  return perms.data_access === "edit";
}
