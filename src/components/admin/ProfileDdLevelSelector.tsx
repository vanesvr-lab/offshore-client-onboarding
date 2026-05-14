"use client";

// B-113 Batch 2 — inline DD-level selector on the per-profile header
// inside `/admin/services/[id]`. Calls the same PATCH endpoint
// `AccountProfilesTable` uses (`/api/admin/profiles/[id]`) so the
// audit-log + permission story matches the global profile-edit surface.
// On success it fires `onLevelChanged` so the parent can splice the new
// level into the `roles` state — the KycLongForm below re-renders with
// `gateSectionForLevel` and EDD-only fields appear/hide immediately.
//
// B-115 — rewritten with a native `<select>` element. The base-ui
// Select was being eaten by the parent's `onClick={e => e.stopPropagation()}`
// wrapper at ServiceDetailClient.tsx (collapse handler) and base-ui's
// `<SelectValue />` didn't render the option label, so the trigger
// showed lowercase `"sdd"`. Native gives us browser-managed click +
// keyboard + screen-reader behaviour and platform-native label
// rendering with no portal to fight with.

import { useState } from "react";
import { toast } from "sonner";

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
    <select
      aria-label="Due diligence level"
      value={currentLevel ?? ""}
      onChange={(e) => void handleChange(e.target.value)}
      disabled={saving}
      className="h-6 w-20 rounded-md border border-gray-300 bg-white px-2 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-navy/30 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {!currentLevel && <option value="">DD</option>}
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
