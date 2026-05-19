// B-101 Batch 5 — role-based portal name helper.
//
// Non-admin viewers see: "Mauritius Offshore - Client Portal"
// Admin viewers see:     "Mauritius Offshore - Admin Portal"
//
// Auth pages (login / set-password) render the brand-only
// string "Mauritius Offshore" because the role isn't known pre-auth.
// Email headers stay on the legacy "Mauritius Offshore Client Portal"
// wording on purpose (emails only go to clients).

export function portalName(isAdmin: boolean): string {
  return isAdmin
    ? "Mauritius Offshore - Admin Portal"
    : "Mauritius Offshore - Client Portal";
}

export const BRAND_NAME = "Mauritius Offshore";
