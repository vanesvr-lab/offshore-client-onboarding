"use client";

// B-119 — Shared subsection accordion shell for the Actions top-level
// section. Mirrors the PersonCard / KYC subsection visual rhythm:
//
//   chevron header  |  label  |  status pill  |  (review badge slot)
//   ---------------------------------------------------------------
//   expanded body
//
// The status pill is the manual completion marker. Click → dropdown →
// PATCH /api/admin/services/[id]/actions { action_key, status }. Each
// subsection composes this shell and supplies the body content.

import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ServiceAction, ServiceActionStatus } from "@/types";

interface Props {
  serviceId: string;
  action: ServiceAction;
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  onSaved?: (next: ServiceAction) => void;
  children: React.ReactNode;
}

const STATUS_OPTIONS: { value: ServiceActionStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "blocked", label: "Blocked" },
  { value: "not_applicable", label: "Not applicable" },
];

const STATUS_TONE: Record<ServiceActionStatus, string> = {
  pending: "bg-gray-100 text-gray-600",
  in_progress: "bg-amber-50 text-amber-700",
  done: "bg-green-50 text-green-700",
  blocked: "bg-red-50 text-red-700",
  not_applicable: "bg-gray-100 text-gray-500",
};

const STATUS_LABEL: Record<ServiceActionStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  done: "Done",
  blocked: "Blocked",
  not_applicable: "N/A",
};

export function ActionSubsection({
  serviceId,
  action,
  title,
  icon,
  defaultOpen = false,
  onSaved,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [saving, setSaving] = useState(false);
  const status = action.status;

  async function handleStatusChange(next: ServiceActionStatus) {
    if (next === status) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/services/${serviceId}/actions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action_key: action.action_key, status: next }),
      });
      const data = (await res.json()) as { data?: ServiceAction; error?: string };
      if (!res.ok || !data.data) throw new Error(data.error ?? "Save failed");
      onSaved?.(data.data);
      toast.success(`${title}: ${STATUS_LABEL[next]}`, { position: "top-right" });
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Save failed",
        { position: "top-right" },
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      id={`action-${action.action_key}`}
      className="border rounded-lg overflow-hidden bg-white"
    >
      <div className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-2 min-w-0 text-left"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 text-gray-500 shrink-0 transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
          {icon && <span className="text-gray-400 shrink-0">{icon}</span>}
          <span className="text-sm font-medium text-gray-900 truncate">
            {title}
          </span>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
          ) : null}
          <div className="relative">
            <select
              value={status}
              onChange={(e) =>
                void handleStatusChange(e.target.value as ServiceActionStatus)
              }
              disabled={saving}
              className={`appearance-none rounded-full pl-2.5 pr-6 py-0.5 text-xs font-medium cursor-pointer disabled:opacity-50 ${STATUS_TONE[status]}`}
              aria-label={`${title} status`}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-500 pointer-events-none" />
          </div>
        </div>
      </div>
      {open && (
        <div className="border-t bg-white px-4 py-3 space-y-3">{children}</div>
      )}
    </div>
  );
}
