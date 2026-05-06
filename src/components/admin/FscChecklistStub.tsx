"use client";

import { useState } from "react";
import { Loader2, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ConnectedSectionHeader,
  ConnectedNotesHistory,
} from "./AdminApplicationSections";
import type { ServiceAction, ServiceActionStatus } from "@/types";

// B-072 Batch 5 — placeholder action for the FSC FS-41 Form A checklist.
// Generation logic deferred; this stub records intent + notes only.

const SECTION_KEY = "action:fsc_checklist";

const STATUS_LABEL: Record<ServiceActionStatus, string> = {
  pending: "Pending",
  in_progress: "Ready to generate",
  done: "Generated",
  blocked: "Blocked",
  not_applicable: "Not applicable",
};

const STATUS_TONE: Record<ServiceActionStatus, string> = {
  pending: "text-gray-500 bg-gray-100",
  in_progress: "text-amber-700 bg-amber-100",
  done: "text-green-700 bg-green-100",
  blocked: "text-red-700 bg-red-100",
  not_applicable: "text-gray-500 bg-gray-100",
};

export function FscChecklistStub({
  serviceId,
  initialAction,
  onSaved,
}: {
  serviceId: string;
  initialAction: ServiceAction;
  onSaved?: (action: ServiceAction) => void;
}) {
  const [action, setAction] = useState<ServiceAction>(initialAction);
  const [notes, setNotes] = useState<string>(initialAction.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function patch(updates: { status?: ServiceActionStatus; notes?: string | null }) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/services/${serviceId}/actions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action_key: "fsc_checklist", ...updates }),
      });
      const json = (await res.json()) as { data?: ServiceAction; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Save failed");
      setAction(json.data);
      onSaved?.(json.data);
      toast.success("FSC checklist action updated");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function handleNotesBlur() {
    if ((notes.trim() || null) === (action.notes?.trim() || null)) return;
    void patch({ notes: notes.trim() || null });
  }

  const isReady = action.status === "in_progress" || action.status === "done";

  return (
    <Card>
      <ConnectedSectionHeader
        title="Generate FSC Checklist"
        sectionKey={SECTION_KEY}
      />
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3 rounded-md border border-dashed border-gray-300 bg-gray-50/60 px-3 py-3 text-sm text-gray-600">
          <FileSpreadsheet className="mt-0.5 size-4 shrink-0 text-gray-400" />
          <p>
            FSC FS-41 Form A checklist —{" "}
            <span className="font-medium">generation coming soon</span>. For now,
            mark the service as ready to generate so the responsible admin
            knows to start the manual draft.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[action.status]}`}
          >
            {action.status === "done" ? (
              <CheckCircle2 className="size-3" />
            ) : null}
            {STATUS_LABEL[action.status]}
          </span>
          {!isReady && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => void patch({ status: "in_progress" })}
            >
              {saving ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
              Mark as ready to generate
            </Button>
          )}
          {action.status === "in_progress" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => void patch({ status: "done" })}
            >
              {saving ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
              Mark as generated
            </Button>
          )}
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
            placeholder="Manual draft owner, FS-41 link, blockers…"
          />
          <p className="text-xs text-gray-400">Notes auto-save on blur.</p>
        </div>

        <ConnectedNotesHistory sectionKey={SECTION_KEY} />
      </CardContent>
    </Card>
  );
}
