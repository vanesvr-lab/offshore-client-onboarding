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
  currentStatus: ApplicationStatus;
}

export function StageSelector({ applicationId, currentStatus }: StageSelectorProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [selected, setSelected] = useState<ApplicationStatus>(currentStatus);
  const [note, setNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const requiresNote = selected === "pending_action" || selected === "rejected";
  const requiresConfirm = selected === "approved" || selected === "rejected";

  async function executeUpdate() {
    if (requiresNote && !note.trim()) {
      toast.error("A note is required for this status change");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/applications/${applicationId}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: selected, note: note || undefined }),
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

  // session is used to confirm the user is still authenticated before acting
  if (!session) return null;

  function handleUpdateClick() {
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
        <Button onClick={handleUpdateClick} disabled={selected === currentStatus || saving} className="bg-brand-navy hover:bg-brand-blue">
          Update
        </Button>
      </div>

      {requiresNote && selected !== currentStatus && (
        <div className="space-y-1">
          <Label className="text-xs text-gray-600">
            {selected === "rejected" ? "Rejection reason *" : "Note for client *"}
          </Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={selected === "rejected" ? "Explain why the application is being rejected…" : "Explain what action the client needs to take…"}
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
          {selected === "rejected" && (
            <div className="space-y-1">
              <Label className="text-sm">Rejection reason *</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Explain why…" />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button
              onClick={executeUpdate}
              disabled={saving || (selected === "rejected" && !note.trim())}
              className={selected === "rejected" ? "bg-red-600 hover:bg-red-700" : "bg-brand-navy hover:bg-brand-blue"}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
