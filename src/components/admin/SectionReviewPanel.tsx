"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Flag, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ApplicationSectionReview, SectionReviewStatus } from "@/types";

interface Props {
  applicationId: string;
  sectionKey: string;
  sectionLabel: string;
  currentStatus: SectionReviewStatus | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (review: ApplicationSectionReview) => void;
}

const OPTIONS: {
  value: SectionReviewStatus;
  label: string;
  Icon: typeof CheckCircle2;
  ring: string;
  ringActive: string;
  iconColor: string;
}[] = [
  {
    value: "approved",
    label: "Approved",
    Icon: CheckCircle2,
    ring: "border-gray-200",
    ringActive: "border-green-500 bg-green-50",
    iconColor: "text-green-600",
  },
  {
    value: "flagged",
    label: "Flagged",
    Icon: Flag,
    ring: "border-gray-200",
    ringActive: "border-amber-500 bg-amber-50",
    iconColor: "text-amber-600",
  },
  {
    value: "rejected",
    label: "Rejected",
    Icon: XCircle,
    ring: "border-gray-200",
    ringActive: "border-red-500 bg-red-50",
    iconColor: "text-red-600",
  },
];

export function SectionReviewPanel({
  applicationId,
  sectionKey,
  sectionLabel,
  currentStatus,
  open,
  onOpenChange,
  onSaved,
}: Props) {
  const [status, setStatus] = useState<SectionReviewStatus | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setStatus(null);
      setNotes("");
    }
  }, [open]);

  const notesRequired = status === "flagged" || status === "rejected";
  const canSave =
    !!status && !saving && (!notesRequired || notes.trim().length > 0);

  async function handleSave() {
    if (!status || saving) return;
    if (notesRequired && !notes.trim()) {
      toast.error("Notes are required when flagging or rejecting");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/applications/${applicationId}/section-reviews`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            section_key: sectionKey,
            status,
            notes: notes.trim() || null,
          }),
        },
      );
      const json = await res.json();
      if (!res.ok || !json?.data) {
        throw new Error(json?.error || "Save failed");
      }
      toast.success("Review saved");
      onSaved(json.data as ApplicationSectionReview);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 sm:max-w-md"
      >
        <SheetHeader className="border-b">
          <SheetTitle>Review: {sectionLabel}</SheetTitle>
          <SheetDescription>
            {currentStatus
              ? `Current status: ${currentStatus}. Saving inserts a new audit row.`
              : "Set a status, optionally add notes, then save. Reviews are advisory."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-3">
            <div className="text-sm font-medium text-gray-700">Status</div>
            <div className="grid gap-2">
              {OPTIONS.map((opt) => {
                const active = status === opt.value;
                const Icon = opt.Icon;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatus(opt.value)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border-2 px-3 py-3 text-left transition-colors",
                      active ? opt.ringActive : opt.ring,
                      "hover:bg-gray-50",
                    )}
                  >
                    <Icon className={cn("size-5", opt.iconColor)} />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">
                        {opt.label}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "size-4 rounded-full border-2",
                        active
                          ? "border-current"
                          : "border-gray-300",
                        active && opt.iconColor,
                      )}
                    >
                      {active ? (
                        <span className="m-0.5 block size-2 rounded-full bg-current" />
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6 space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Notes
              {notesRequired ? (
                <span className="ml-1 text-red-600">*</span>
              ) : (
                <span className="ml-1 text-gray-400">(optional)</span>
              )}
            </label>
            <Textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                notesRequired
                  ? "Required: explain what needs to change…"
                  : "Optional context for this approval…"
              }
              className="min-h-24"
            />
          </div>
        </div>

        <SheetFooter className="border-t flex-row justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={!canSave}
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Save review
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
