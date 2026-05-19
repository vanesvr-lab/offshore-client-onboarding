"use client";

// B-127 — `/admin/settings/admins` client surface. Three sections:
//   1. Admins list (table) with role-edit + remove + resend-invite.
//   2. Invite modal (POST /api/admin/admins).
//   3. Role editor — five cards, one per system role, with the 10
//      permission flags. The tier-4 cards (Super User → Junior Officer)
//      render in privilege order; the Auditor card sits in its own
//      "External" group at the bottom because it isn't a tier above
//      or below the others — it's a read-only-with-export lane for
//      compliance auditors.
//
// All mutations route through the new API and optimistically splice
// the parent state on success.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2,
  Mail,
  Trash2,
  Send,
  UserPlus,
  ShieldCheck,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export interface AdminRow {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  last_login_at: string | null;
  is_active: boolean;
  has_password: boolean;
  role_slug: string;
  role_name: string;
  is_self: boolean;
}

export interface RoleRow {
  id: string;
  name: string;
  slug: string;
  is_system: boolean;
  data_access: "none" | "view" | "edit";
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

const FLAG_FIELDS = [
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

type FlagField = (typeof FLAG_FIELDS)[number];

const FLAG_LABELS: Record<FlagField, { label: string; hint: string }> = {
  settings_access: {
    label: "Access settings",
    hint: "Open /admin/settings/* (templates, rules, workflow, etc.).",
  },
  admin_mgmt_access: {
    label: "Manage admins",
    hint: "Invite, change role, or remove other admins. Required to open this page.",
  },
  change_status: {
    label: "Propose status change",
    hint: "Initiate a service status advance. Without approve, the button shows but is disabled.",
  },
  approve_status_change: {
    label: "Approve status change",
    hint: "Commit a status transition or run the Override dropdown.",
  },
  send_communications: {
    label: "Send communications",
    hint: "KYC invites, client invites, ad-hoc emails from the Communications dialog.",
  },
  destructive_actions: {
    label: "Destructive actions",
    hint: "Soft-delete clients, services, and profiles.",
  },
  view_audit_log: {
    label: "View audit log",
    hint: "See the Audit Trail card on service pages and any future audit views.",
  },
  export_data: {
    label: "Export data",
    hint: "Download CSVs (Audit Trail CSV button, future report exports).",
  },
  can_review: {
    label: "Sign off on reviews",
    hint: "Mark sections reviewed, approve peer/manager review requests, commit substance assessments.",
  },
};

// Privilege-ordered tier roles first, Auditor in its own "External" group.
const TIER_ORDER = ["super_user", "manager", "officer", "junior_officer"] as const;

function formatAccount(role: RoleRow): string {
  const tone =
    role.slug === "super_user"
      ? "Apex tier — full access by default."
      : role.slug === "manager"
        ? "Day-to-day team lead — sign off + approve status changes."
        : role.slug === "officer"
          ? "KYC officer — edit data + propose status changes."
          : role.slug === "junior_officer"
            ? "Read-only KYC reviewer — audit log visibility, no edits."
            : role.slug === "auditor"
              ? "External auditor — view-only with audit log + CSV export."
              : "Custom role.";
  return tone;
}

export function AdminsClient({
  admins: initialAdmins,
  roles: initialRoles,
}: {
  admins: AdminRow[];
  roles: RoleRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [admins, setAdmins] = useState(initialAdmins);
  const [roles, setRoles] = useState(initialRoles);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<AdminRow | null>(null);
  const [pending, startTransition] = useTransition();

  const tierRoles = TIER_ORDER
    .map((slug) => roles.find((r) => r.slug === slug))
    .filter((r): r is RoleRow => !!r);
  const auditorRole = roles.find((r) => r.slug === "auditor");

  async function handleRoleChange(adminId: string, nextSlug: string) {
    const prev = admins.find((a) => a.id === adminId);
    if (!prev || prev.role_slug === nextSlug) return;
    const nextRole = roles.find((r) => r.slug === nextSlug);
    if (!nextRole) return;
    // Optimistic
    setAdmins((rows) =>
      rows.map((r) =>
        r.id === adminId ? { ...r, role_slug: nextRole.slug, role_name: nextRole.name } : r,
      ),
    );
    try {
      const res = await fetch(`/api/admin/admins/${adminId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role_slug: nextSlug }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to change role");
      toast.success(`Role updated to ${nextRole.name}`);
    } catch (err) {
      // Revert
      setAdmins((rows) =>
        rows.map((r) =>
          r.id === adminId
            ? { ...r, role_slug: prev.role_slug, role_name: prev.role_name }
            : r,
        ),
      );
      toast.error(err instanceof Error ? err.message : "Failed to change role");
    }
  }

  function handleRemoveClick(admin: AdminRow) {
    setRemoveTarget(admin);
  }

  async function handleRemoveConfirm() {
    if (!removeTarget) return;
    const target = removeTarget;
    setRemoveTarget(null);
    try {
      const res = await fetch(`/api/admin/admins/${target.id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to remove admin");
      setAdmins((rows) => rows.filter((r) => r.id !== target.id));
      toast.success(`${target.full_name} removed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove admin");
    }
  }

  async function handleResendInvite(admin: AdminRow) {
    try {
      const res = await fetch(`/api/admin/admins/${admin.id}/resend-invite`, {
        method: "POST",
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to resend invite");
      toast.success(`Invite resent to ${admin.email}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resend invite");
    }
  }

  async function handleFlagToggle(
    role: RoleRow,
    field: FlagField,
    next: boolean,
  ) {
    // Super User self-protection: admin_mgmt_access is locked on.
    if (role.slug === "super_user" && field === "admin_mgmt_access" && !next) {
      toast.error("admin_mgmt_access cannot be disabled on Super User.");
      return;
    }
    const prevValue = role[field];
    if (prevValue === next) return;

    // Optimistic
    setRoles((rs) =>
      rs.map((r) => (r.id === role.id ? { ...r, [field]: next } : r)),
    );
    try {
      const res = await fetch(`/api/admin/admin-roles/${role.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: next }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to update permission");
      toast.success(`${role.name}: ${FLAG_LABELS[field].label} ${next ? "on" : "off"}`);
    } catch (err) {
      // Revert
      setRoles((rs) =>
        rs.map((r) => (r.id === role.id ? { ...r, [field]: prevValue } : r)),
      );
      toast.error(err instanceof Error ? err.message : "Failed to update permission");
    }
  }

  async function handleDataAccessChange(
    role: RoleRow,
    next: "none" | "view" | "edit",
  ) {
    const prevValue = role.data_access;
    if (prevValue === next) return;
    setRoles((rs) =>
      rs.map((r) => (r.id === role.id ? { ...r, data_access: next } : r)),
    );
    try {
      const res = await fetch(`/api/admin/admin-roles/${role.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_access: next }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to update data access");
      toast.success(`${role.name}: data access ${next}`);
    } catch (err) {
      setRoles((rs) =>
        rs.map((r) => (r.id === role.id ? { ...r, data_access: prevValue } : r)),
      );
      toast.error(err instanceof Error ? err.message : "Failed to update data access");
    }
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-brand-navy">Admins</h1>
        <p className="text-sm text-gray-600">
          Manage who has admin access, what role they hold, and which actions each role can perform.
        </p>
      </header>

      {/* ── Section 1: Admins list ─────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-brand-navy uppercase tracking-wider">
            Admins ({admins.length})
          </h2>
          <Button onClick={() => setInviteOpen(true)} className="gap-1.5">
            <UserPlus className="h-4 w-4" />
            Invite admin
          </Button>
        </div>

        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-500">Name</th>
                <th className="text-left px-4 py-2 font-medium text-gray-500">Email</th>
                <th className="text-left px-4 py-2 font-medium text-gray-500">Role</th>
                <th className="text-left px-4 py-2 font-medium text-gray-500">Status</th>
                <th className="text-right px-4 py-2 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {admins.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2 text-gray-900">
                    {a.full_name}
                    {a.is_self && (
                      <span className="ml-1.5 text-[10px] uppercase tracking-wider text-gray-400">
                        (you)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{a.email}</td>
                  <td className="px-4 py-2">
                    <select
                      value={a.role_slug}
                      onChange={(e) => void handleRoleChange(a.id, e.target.value)}
                      className="border rounded-md px-2 py-1 text-xs bg-white"
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.slug}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    {a.has_password ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Invited
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex items-center gap-1">
                      {!a.has_password && (
                        <Button
                          variant="ghost"
                          onClick={() => void handleResendInvite(a)}
                          className="h-7 px-2 text-xs text-brand-navy"
                          title="Resend invite email"
                        >
                          <Send className="h-3.5 w-3.5 mr-1" />
                          Resend
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        onClick={() => handleRemoveClick(a)}
                        className="h-7 px-2 text-xs text-red-700 hover:bg-red-50"
                        disabled={a.is_self}
                        title={a.is_self ? "You can't remove yourself" : "Remove admin"}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Remove
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {admins.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                    No admins yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Section 2: Role editor — tiered ─────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-brand-navy uppercase tracking-wider">
          Role permissions
        </h2>
        <p className="text-xs text-gray-500 -mt-2">
          The 5 system roles are seeded with sensible defaults — toggle individual flags to fine-tune.
          System roles can&apos;t be renamed or deleted, but their permissions are fully editable
          (except <code className="bg-gray-100 px-1 rounded">admin_mgmt_access</code> on Super User,
          which is locked on so you can never lose admin management access).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {tierRoles.map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              onFlagToggle={(field, next) => void handleFlagToggle(role, field, next)}
              onDataAccessChange={(next) => void handleDataAccessChange(role, next)}
            />
          ))}
        </div>
      </section>

      {auditorRole && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-brand-navy uppercase tracking-wider">
            External
          </h2>
          <p className="text-xs text-gray-500 -mt-2">
            Roles outside the tier ladder. The Auditor role grants read-only access plus the
            audit log + CSV export — useful for compliance partners who need evidence but
            shouldn&apos;t be able to change anything.
          </p>
          <RoleCard
            role={auditorRole}
            onFlagToggle={(field, next) =>
              void handleFlagToggle(auditorRole, field, next)
            }
            onDataAccessChange={(next) =>
              void handleDataAccessChange(auditorRole, next)
            }
          />
        </section>
      )}

      {/* ── Invite modal ───────────────────────────────────────────────── */}
      <InviteDialog
        open={inviteOpen}
        roles={roles}
        onOpenChange={setInviteOpen}
        onInvited={(newAdmin) => {
          setAdmins((rows) => [...rows, newAdmin]);
          startTransition(() => router.refresh());
        }}
      />

      {/* ── Remove confirmation ────────────────────────────────────────── */}
      <Dialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove admin?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            <strong>{removeTarget?.full_name}</strong> ({removeTarget?.email}) will lose all
            portal access. Their audit history is preserved.
          </p>
          <DialogFooter>
            <DialogClose
              render={
                <Button variant="outline" disabled={pending}>
                  Cancel
                </Button>
              }
            />
            <Button
              onClick={() => void handleRemoveConfirm()}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={pending}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

function RoleCard({
  role,
  onFlagToggle,
  onDataAccessChange,
}: {
  role: RoleRow;
  onFlagToggle: (field: FlagField, next: boolean) => void;
  onDataAccessChange: (next: "none" | "view" | "edit") => void;
}) {
  return (
    <div className="bg-white border rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-brand-navy inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-gray-400" />
            {role.name}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">{formatAccount(role)}</p>
        </div>
        {role.is_system && (
          <span className="text-[9px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
            System
          </span>
        )}
      </div>

      {/* Data access tri-state */}
      <div className="flex items-start justify-between gap-3 pt-2 border-t">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-700">Data access</p>
          <p className="text-xs text-gray-500 mt-0.5">
            None = no read of services/clients/KYC. View = read-only. Edit = full CRUD.
          </p>
        </div>
        <select
          value={role.data_access}
          onChange={(e) =>
            onDataAccessChange(e.target.value as "none" | "view" | "edit")
          }
          className="border rounded-md px-2 py-1 text-xs bg-white shrink-0"
        >
          <option value="none">None</option>
          <option value="view">View</option>
          <option value="edit">Edit</option>
        </select>
      </div>

      {/* 9 boolean flags */}
      <div className="space-y-2 pt-2 border-t">
        {FLAG_FIELDS.map((field) => {
          const locked =
            role.slug === "super_user" && field === "admin_mgmt_access";
          return (
            <div key={field} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-gray-700">{FLAG_LABELS[field].label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{FLAG_LABELS[field].hint}</p>
              </div>
              <div className="shrink-0 pt-0.5">
                <Switch
                  checked={role[field]}
                  onCheckedChange={(v) => onFlagToggle(field, v)}
                  disabled={locked}
                  title={
                    locked
                      ? "This permission cannot be disabled on the Super User role."
                      : undefined
                  }
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InviteDialog({
  open,
  roles,
  onOpenChange,
  onInvited,
}: {
  open: boolean;
  roles: RoleRow[];
  onOpenChange: (open: boolean) => void;
  onInvited: (admin: AdminRow) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleSlug, setRoleSlug] = useState("officer");
  const [sending, setSending] = useState(false);

  function reset() {
    setName("");
    setEmail("");
    setRoleSlug("officer");
    setSending(false);
  }

  async function handleSend() {
    if (!name.trim() || !email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role_slug: roleSlug }),
      });
      const json = (await res.json()) as {
        error?: string;
        id?: string;
        user_id?: string;
        role_slug?: string;
        role_name?: string;
        email?: string;
      };
      if (!res.ok || !json.id) throw new Error(json.error ?? "Failed to invite");
      onInvited({
        id: json.id!,
        user_id: json.user_id!,
        email: json.email!,
        full_name: name,
        last_login_at: null,
        is_active: true,
        has_password: false,
        role_slug: json.role_slug ?? roleSlug,
        role_name: json.role_name ?? roles.find((r) => r.slug === roleSlug)?.name ?? "Officer",
        is_self: false,
      });
      toast.success(`Invite sent to ${email}`);
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to invite");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite admin</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Role</label>
            <select
              value={roleSlug}
              onChange={(e) => setRoleSlug(e.target.value)}
              className="w-full border rounded-md px-2 py-1.5 text-sm bg-white"
            >
              {roles.map((r) => (
                <option key={r.id} value={r.slug}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-gray-500 inline-flex items-start gap-1">
            <Mail className="h-3 w-3 mt-0.5 shrink-0" />
            A magic link is emailed to this address. The recipient sets their password at
            /auth/set-password — no temp password.
          </p>
        </div>
        <DialogFooter>
          <DialogClose
            render={<Button variant="outline" disabled={sending}>Cancel</Button>}
          />
          <Button onClick={() => void handleSend()} disabled={sending} className="gap-1.5">
            {sending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Send invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
