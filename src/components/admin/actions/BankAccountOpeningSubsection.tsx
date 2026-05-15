"use client";

// B-119 — Bank Account Opening subsection wrapper. Body content (notes
// only; status moved up to the subsection header) is rendered inline to
// keep the existing endpoint behaviour without duplicating the status
// pill that the stub used to own.

import { useState } from "react";
import { Landmark } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ActionSubsection } from "./ActionSubsection";
import type { ServiceAction } from "@/types";

interface Props {
  serviceId: string;
  action: ServiceAction;
  onSaved?: (action: ServiceAction) => void;
  defaultOpen?: boolean;
}

export function BankAccountOpeningSubsection({
  serviceId,
  action,
  onSaved,
  defaultOpen,
}: Props) {
  const [notes, setNotes] = useState<string>(action.notes ?? "");

  async function handleNotesBlur() {
    if ((notes.trim() || null) === (action.notes?.trim() || null)) return;
    try {
      const res = await fetch(`/api/admin/services/${serviceId}/actions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action_key: "bank_account_opening",
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
      title="Bank Account Opening"
      icon={<Landmark className="h-3.5 w-3.5" />}
      onSaved={onSaved}
      defaultOpen={defaultOpen}
    >
      <p className="text-xs text-gray-500">
        Bank account engagement workflow — full flow coming later. Use the
        status pill above to track progress; capture any context in the
        notes below.
      </p>
      <div className="space-y-1">
        <Label className="text-xs">Internal notes</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => void handleNotesBlur()}
          placeholder="Bank, contact, status updates…"
          rows={3}
          className="text-sm resize-none"
        />
        <p className="text-xs text-gray-400">Notes auto-save on blur.</p>
      </div>
    </ActionSubsection>
  );
}
