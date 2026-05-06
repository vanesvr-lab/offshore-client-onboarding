"use client";

import { useState } from "react";
import { Loader2, Landmark } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  ConnectedSectionHeader,
  ConnectedNotesHistory,
} from "./AdminApplicationSections";
import type { ServiceAction, ServiceActionStatus } from "@/types";

// B-072 Batch 5 — placeholder action for bank account engagement.
// Real workflow logic deferred; this stub records status + notes only.

const SECTION_KEY = "action:bank_account_opening";

const STATUS_OPTIONS: { value: ServiceActionStatus; label: string }[] = [
  { value: "pending",        label: "Pending" },
  { value: "in_progress",    label: "In progress" },
  { value: "done",           label: "Done" },
  { value: "blocked",        label: "Blocked" },
  { value: "not_applicable", label: "Not applicable" },
];

export function BankAccountOpeningStub({
  serviceId,
  initialAction,
  onSaved,
}: {
  serviceId: string;
  initialAction: ServiceAction;
  onSaved?: (action: ServiceAction) => void;
}) {
  const [status, setStatus] = useState<ServiceActionStatus>(initialAction.status);
  const [notes, setNotes] = useState<string>(initialAction.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function patch(updates: { status?: ServiceActionStatus; notes?: string | null }) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/services/${serviceId}/actions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action_key: "bank_account_opening", ...updates }),
      });
      const json = (await res.json()) as { data?: ServiceAction; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Save failed");
      onSaved?.(json.data);
      toast.success("Bank account opening updated");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function handleStatusChange(next: ServiceActionStatus) {
    setStatus(next);
    void patch({ status: next });
  }

  function handleNotesBlur() {
    if ((notes.trim() || null) === (initialAction.notes?.trim() || null)) return;
    void patch({ notes: notes.trim() || null });
  }

  return (
    <Card>
      <ConnectedSectionHeader
        title="Bank Account Opening"
        sectionKey={SECTION_KEY}
      />
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3 rounded-md border border-dashed border-gray-300 bg-gray-50/60 px-3 py-3 text-sm text-gray-600">
          <Landmark className="mt-0.5 size-4 shrink-0 text-gray-400" />
          <p>
            Bank account engagement workflow —{" "}
            <span className="font-medium">coming soon</span>. Use this card to
            track status until the full workflow ships.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
              Status
            </label>
            <div className="relative">
              <select
                value={status}
                onChange={(e) => handleStatusChange(e.target.value as ServiceActionStatus)}
                disabled={saving}
                className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm cursor-pointer disabled:opacity-50"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            {saving ? (
              <Loader2 className="size-3.5 animate-spin text-gray-400" />
            ) : null}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
            Internal notes
          </label>
          <Textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
            placeholder="Bank, contact, status updates…"
          />
          <p className="text-xs text-gray-400">Notes auto-save on blur.</p>
        </div>

        <ConnectedNotesHistory sectionKey={SECTION_KEY} />
      </CardContent>
    </Card>
  );
}
