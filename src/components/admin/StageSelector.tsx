"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { APPLICATION_STATUS_LABELS } from "@/lib/utils/constants";
import type { ApplicationStatus } from "@/types";

const MOVABLE_STAGES: ApplicationStatus[] = [
  "in_review",
  "pending_action",
  "verification",
  "approved",
  "rejected",
];

interface StageSelectorProps {
  applicationId: string;
  clientId: string;
  currentStatus: ApplicationStatus;
}

export function StageSelector({ applicationId, clientId, currentStatus }: StageSelectorProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [selected, setSelected] = useState<ApplicationStatus>(currentStatus);
  const [note, setNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [riskBlockers, setRiskBlockers] = useState<string[]>([]);
  const [riskChecking, setRiskChecking] = useState(false);

  const hasChanged = selected !== currentStatus;
  const requiresConfirm = selected === "approved" || selected === "rejected";

  const notePlaceholder =
    selected === "rejected"
      ? "Explain why the application is being rejected…"
      : selected === "pending_action"
      ? "Explain what action the client needs to take…"
      : "Add a note for this stage change…";

  const noteLabel =
    selected === "rejected"
      ? "Rejection reason *"
      : selected === "pending_action"
      ? "Note for client *"
      : "Note *";

  async function executeUpdate() {
    if (!note.trim()) {
      toast.error("A note is required for stage changes");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/applications/${applicationId}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: selected, note: note.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Update failed");
      }
      toast.success(`Status updated to ${APPLICATION_STATUS_LABELS[selected]}`);
      setConfirmOpen(false);
      setNote("");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  if (!session) return null;

  async function handleUpdateClick() {
    if (selected === "approved") {
      // Check risk assessment completeness before allowing approval
      setRiskChecking(true);
      try {
        const res = await fetch(`/api/kyc/${clientId}`);
        const data = await res.json() as { records?: Array<{
          risk_rating: string | null;
          sanctions_checked: boolean;
          adverse_media_checked: boolean;
          pep_verified: boolean;
        }> };
        const records = data.records ?? [];
        const blockers: string[] = [];
        for (const r of records) {
          if (!r.risk_rating) blockers.push("Risk rating not set");
          if (!r.sanctions_checked) blockers.push("Sanctions screening not completed");
          if (!r.adverse_media_checked) blockers.push("Adverse media check not completed");
          if (!r.pep_verified) blockers.push("PEP verification not completed");
        }
        const unique = blockers.filter((v, i, a) => a.indexOf(v) === i);
        setRiskBlockers(unique);
        if (unique.length > 0) return;
      } finally {
        setRiskChecking(false);
      }
    } else {
      setRiskBlockers([]);
    }
    if (requiresConfirm) {
      setConfirmOpen(true);
    } else {
      executeUpdate();
    }
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium text-gray-700">Move to stage</Label>
      <div className="flex gap-2">
        <Select value={selected} onValueChange={(v) => setSelected(v as ApplicationStatus)}>
          <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MOVABLE_STAGES.map((s) => (
              <SelectItem key={s} value={s}>{APPLICATION_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={handleUpdateClick}
          disabled={!hasChanged || saving || !note.trim() || riskChecking}
          className="bg-brand-navy hover:bg-brand-blue"
        >
          {riskChecking ? "Checking…" : "Update"}
        </Button>
      </div>

      {riskBlockers.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 space-y-1">
          <p className="text-xs font-medium text-red-700">Cannot approve — risk assessment incomplete:</p>
          <ul className="list-disc list-inside text-xs text-red-600 space-y-0.5">
            {riskBlockers.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </div>
      )}

      {hasChanged && (
        <div className="space-y-1">
          <Label className="text-xs text-gray-600">{noteLabel}</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={notePlaceholder}
          />
        </div>
      )}

      <Dialog disablePointerDismissal open={confirmOpen} onOpenChange={(o) => setConfirmOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm {APPLICATION_STATUS_LABELS[selected]}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Are you sure you want to mark this application as{" "}
            <strong>{APPLICATION_STATUS_LABELS[selected]}</strong>?
          </p>
          {note.trim() && (
            <div className="rounded border bg-gray-50 px-3 py-2 text-sm text-gray-700 italic">
              &ldquo;{note.trim()}&rdquo;
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={executeUpdate}
              disabled={saving}
              className={
                selected === "rejected"
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-brand-navy hover:bg-brand-blue"
              }
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
