"use client";

// B-119 — FSC Checklist subsection wrapper. Status moves to the
// subsection header; the body keeps the notes textarea + the prose
// callout from the stub.

import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ActionSubsection } from "./ActionSubsection";
import {
  ReferenceFormsPanel,
  type ReferenceFormSummary,
  type SubmittedFormSummary,
} from "./ReferenceFormsPanel";
import type { ServiceAction } from "@/types";

interface Props {
  serviceId: string;
  action: ServiceAction;
  onSaved?: (action: ServiceAction) => void;
  defaultOpen?: boolean;
  referenceForms?: ReferenceFormSummary[];
  submittedFormsByRefId?: Record<string, SubmittedFormSummary[]>;
}

export function FscChecklistSubsection({
  serviceId,
  action,
  onSaved,
  defaultOpen,
  referenceForms = [],
  submittedFormsByRefId = {},
}: Props) {
  const [notes, setNotes] = useState<string>(action.notes ?? "");

  async function handleNotesBlur() {
    if ((notes.trim() || null) === (action.notes?.trim() || null)) return;
    try {
      const res = await fetch(`/api/admin/services/${serviceId}/actions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action_key: "fsc_checklist",
          notes: notes.trim() || null,
        }),
      });
      const data = (await res.json()) as {
        data?: ServiceAction;
        error?: string;
      };
      if (!res.ok || !data.data) throw new Error(data.error ?? "Save failed");
      onSaved?.(data.data);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Save failed",
        { position: "top-right" },
      );
    }
  }

  return (
    <ActionSubsection
      serviceId={serviceId}
      action={action}
      title="Generate FSC Checklist"
      icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
      onSaved={onSaved}
      defaultOpen={defaultOpen}
    >
      <p className="text-xs text-gray-500">
        FSC FS-41 Form A checklist — generation coming later. Use the
        status pill above to mark progress; the linked reference form
        will land in a follow-up brief.
      </p>
      <div className="space-y-1">
        <Label className="text-xs">Internal notes</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => void handleNotesBlur()}
          placeholder="Manual draft owner, FS-41 link, blockers…"
          rows={3}
          className="text-sm resize-none"
        />
        <p className="text-xs text-gray-400">Notes auto-save on blur.</p>
      </div>
      <ReferenceFormsPanel
        serviceId={serviceId}
        actionKey="fsc_checklist"
        referenceForms={referenceForms}
        submittedFormsByRefId={submittedFormsByRefId}
      />
    </ActionSubsection>
  );
}
