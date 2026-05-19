"use client";

// B-127 — React context for the admin's permission snapshot. The
// server component for `/admin/services/[id]` (and similar pages)
// passes `session.user.adminPermissions` into the provider; deeply
// nested client components (SectionReviewButton, the substance
// review save button, review-request action buttons) read via
// useAdminPermissions() instead of being prop-drilled. The context
// can be null (caller forgot to wrap, or the page renders for a
// client user) — every consumer should null-safe-check.

import { createContext, useContext } from "react";
import type { AdminPermissions, PermissionFlag } from "./admin-permissions";

const AdminPermissionsContext = createContext<AdminPermissions | null>(null);

export function AdminPermissionsProvider({
  value,
  children,
}: {
  value: AdminPermissions | null;
  children: React.ReactNode;
}) {
  return (
    <AdminPermissionsContext.Provider value={value}>
      {children}
    </AdminPermissionsContext.Provider>
  );
}

export function useAdminPermissions(): AdminPermissions | null {
  return useContext(AdminPermissionsContext);
}

export function useHasFlag(flag: PermissionFlag): boolean {
  const perms = useContext(AdminPermissionsContext);
  return !!perms?.[flag];
}
