"use client";

// B-113 Batch 2 — inline DD-level selector on the per-profile header
// inside `/admin/services/[id]`. Calls the same PATCH endpoint
// `AccountProfilesTable` uses (`/api/admin/profiles/[id]`) so the
// audit-log + permission story matches the global profile-edit surface.
// On success it fires `onLevelChanged` so the parent can splice the new
// level into the `roles` state — the KycLongForm below re-renders with
// `gateSectionForLevel` and EDD-only fields appear/hide immediately.

import { useState } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  profileId: string;
  currentLevel: string | null;
  onLevelChanged: (next: string) => void;
}

const OPTIONS: { value: string; label: string }[] = [
  { value: "sdd", label: "SDD" },
  { value: "cdd", label: "CDD" },
  { value: "edd", label: "EDD" },
];

export function ProfileDdLevelSelector({
  profileId,
  currentLevel,
  onLevelChanged,
}: Props) {
  const [saving, setSaving] = useState(false);

  async function handleChange(next: string) {
    if (!next || next === currentLevel || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/profiles/${profileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ due_diligence_level: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to update DD level");
      }
      onLevelChanged(next);
      toast.success(`DD level updated to ${next.toUpperCase()}`, {
        position: "top-right",
      });
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update DD level",
        { position: "top-right" },
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Select
      value={currentLevel ?? ""}
      onValueChange={(v) => handleChange(v ?? "")}
      disabled={saving}
    >
      <SelectTrigger
        aria-label="Due diligence level"
        className="h-6 w-[78px] text-xs"
      >
        <SelectValue placeholder="DD" />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
