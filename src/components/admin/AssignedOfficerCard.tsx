// B-130 — Right-rail card for assigning / reassigning the officer
// owning a service. Gated on data_access=edit (Junior Officer + Auditor
// see a disabled select with a tooltip).

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserCog } from "lucide-react";
import { hasDataAccess } from "@/lib/admin-permissions";
import type { AdminPermissions } from "@/lib/admin-permissions";

interface AdminOption {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

interface Props {
  serviceId: string;
  assignedAdminId: string | null;
  admins: AdminOption[];
  adminPermissions: AdminPermissions | null;
}

const UNASSIGNED = "__unassigned__";

export function AssignedOfficerCard({
  serviceId,
  assignedAdminId,
  admins,
  adminPermissions,
}: Props) {
  const router = useRouter();
  const canEdit = hasDataAccess(adminPermissions, "edit");
  const [value, setValue] = useState<string>(assignedAdminId ?? UNASSIGNED);
  const [busy, setBusy] = useState(false);

  async function commit(next: string) {
    if (!canEdit) return;
    setBusy(true);
    const previous = value;
    setValue(next);
    try {
      const res = await fetch(`/api/admin/services/${serviceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigned_admin_id: next === UNASSIGNED ? null : next,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to update assignment");
      }
      toast.success(
        next === UNASSIGNED
          ? "Assignment cleared"
          : `Assigned to ${admins.find((a) => a.user_id === next)?.full_name ?? "officer"}`,
      );
      router.refresh();
    } catch (err) {
      setValue(previous);
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white border rounded-xl px-4 py-3 space-y-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
        <UserCog className="h-3.5 w-3.5" />
        Assigned Officer
      </p>
      <Select
        value={value}
        onValueChange={(v) => v && commit(v)}
        disabled={!canEdit || busy}
      >
        <SelectTrigger
          className="w-full h-9 text-sm"
          title={
            !canEdit
              ? "Your role can't reassign services"
              : undefined
          }
        >
          <SelectValue placeholder="Select an officer" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNASSIGNED}>— Unassigned —</SelectItem>
          {admins.map((a) => (
            <SelectItem key={a.user_id} value={a.user_id}>
              {a.full_name ?? a.email ?? "Unnamed admin"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!canEdit && (
        <p className="text-[11px] text-gray-400">
          Your role can&apos;t reassign services.
        </p>
      )}
    </div>
  );
}
