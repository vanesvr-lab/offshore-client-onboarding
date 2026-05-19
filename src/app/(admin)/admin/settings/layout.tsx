import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// B-127 — Settings group is gated on `settings_access`. The parent
// `(admin)/layout.tsx` already enforces "must be an admin"; this layer
// adds the role-flag gate so a Manager / Officer / Junior Officer /
// Auditor whose `settings_access` is false can't deep-link into any
// settings page. The Admins page (admin_mgmt_access) gets its own
// extra check at the page level.
export default async function AdminSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session || session.user.role !== "admin") redirect("/login");
  if (!session.user.adminPermissions?.settings_access) {
    redirect("/admin/dashboard");
  }
  return <>{children}</>;
}
