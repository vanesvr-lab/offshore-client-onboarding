"use client";

// B-077 Batch 5 — per-profile aggregate review summary panel.
//
// Renders a right-slide Sheet that lists every reviewable subsection
// (Identity / Financial / Declarations for individuals, Identity / Tax
// for organisations) with the latest review status + last note. Admin
// can click any row to scroll to that subsection in the long form, or
// use the bottom Approve all / Flag profile bulk actions to write the
// same status to every subsection in one go (sequential POSTs to the
// existing `/api/admin/applications/[id]/section-reviews` endpoint —
// no bulk endpoint added; see B-077 brief "out of scope").

import { useState } from "react";
import { CheckCircle2, Flag, Loader2, ChevronRight } from "lucide-react";
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
import { SectionReviewBadge } from "./SectionReviewBadge";
import {
  useAggregateStatus,
  useSectionReviews,
} from "./AdminApplicationSections";
import type { ApplicationSectionReview, SectionReviewStatus } from "@/types";

export interface PerProfileSubsection {
  /** Section key (e.g. `kyc:<profileId>:identity`). */
  key: string;
  /** Display label shown in the row (e.g. "Identity"). */
  label: string;
  /** DOM element id to scroll into view when the row is clicked. */
  anchorId: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileName: string;
  subsections: PerProfileSubsection[];
}

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const oneDay = 24 * 60 * 60 * 1000;
  if (diffMs < 60 * 1000) return "just now";
  if (diffMs < 60 * 60 * 1000)
    return `${Math.round(diffMs / (60 * 1000))} min ago`;
  if (diffMs < oneDay) return `${Math.round(diffMs / (60 * 60 * 1000))} h ago`;
  const days = Math.round(diffMs / oneDay);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

export function PerProfileReviewSummaryPanel({
  open,
  onOpenChange,
  profileName,
  subsections,
}: Props) {
  const [batchNote, setBatchNote] = useState("");
  const [bulkAction, setBulkAction] = useState<"approve" | "flag" | null>(null);

  const sectionKeys = subsections.map((s) => s.key);
  const { applicationId, rows, addReview } = useSectionReviews(sectionKeys);
  const aggregate = useAggregateStatus(sectionKeys);

  function handleSubsectionClick(anchorId: string) {
    onOpenChange(false);
    requestAnimationFrame(() => {
      document
        .getElementById(anchorId)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function postReview(
    sectionKey: string,
    status: SectionReviewStatus,
    notes: string | null,
  ): Promise<ApplicationSectionReview> {
    const res = await fetch(
      `/api/admin/applications/${applicationId}/section-reviews`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section_key: sectionKey, status, notes }),
      },
    );
    const json = await res.json();
    if (!res.ok || !json?.data) {
      throw new Error(json?.error || "Save failed");
    }
    return json.data as ApplicationSectionReview;
  }

  async function handleApproveAll() {
    // Approve every subsection that's currently null or flagged.
    const targets = rows.filter(
      (r) => r.latest === null || r.latest.status === "flagged",
    );
    if (targets.length === 0) {
      toast.info("Nothing to approve — all subsections already approved/rejected.");
      return;
    }
    setBulkAction("approve");
    let successCount = 0;
    try {
      for (const t of targets) {
        const review = await postReview(
          t.sectionKey,
          "approved",
          batchNote.trim() || null,
        );
        addReview(review);
        successCount++;
      }
      toast.success(
        `Approved ${successCount} subsection${successCount === 1 ? "" : "s"} for ${profileName}`,
      );
      setBatchNote("");
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `${err.message} (saved ${successCount}/${targets.length})`
          : "Bulk approve failed",
      );
    } finally {
      setBulkAction(null);
    }
  }

  async function handleFlagProfile() {
    if (!batchNote.trim()) {
      toast.error("A note is required when flagging a profile.");
      return;
    }
    // Flag every subsection regardless of current status (the brief
    // explicitly says "flag the entire profile") so the admin trail
    // captures the cross-cutting concern on every key.
    setBulkAction("flag");
    let successCount = 0;
    try {
      for (const r of rows) {
        const review = await postReview(
          r.sectionKey,
          "flagged",
          batchNote.trim(),
        );
        addReview(review);
        successCount++;
      }
      toast.success(
        `Flagged ${successCount} subsection${successCount === 1 ? "" : "s"} for ${profileName}`,
      );
      setBatchNote("");
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `${err.message} (saved ${successCount}/${rows.length})`
          : "Bulk flag failed",
      );
    } finally {
      setBulkAction(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 sm:max-w-md"
      >
        <SheetHeader className="border-b">
          <SheetTitle>Review Summary — {profileName}</SheetTitle>
          <SheetDescription>
            Aggregate of every reviewable KYC subsection for this profile.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Aggregate badge */}
          <div className="rounded-lg border bg-gray-50 px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                Aggregate status
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                {aggregate.reviewedCount} of {aggregate.totalCount} subsections
                reviewed
              </p>
            </div>
            <SectionReviewBadge status={aggregate.status} />
          </div>

          {/* Per-subsection list */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              Subsections
            </p>
            <div className="rounded-lg border divide-y bg-white">
              {subsections.map((s) => {
                const row = rows.find((r) => r.sectionKey === s.key);
                const latest = row?.latest ?? null;
                const reviewerName = latest?.profiles?.full_name ?? null;
                const note = latest?.notes ?? null;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => handleSubsectionClick(s.anchorId)}
                    className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors flex items-start gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">
                          {s.label}
                        </span>
                        <SectionReviewBadge status={latest?.status ?? null} />
                      </div>
                      {latest && (
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          by {reviewerName ?? "admin"} ·{" "}
                          {formatRelative(latest.reviewed_at)}
                        </p>
                      )}
                      {note && (
                        <p className="text-xs text-gray-600 italic mt-1 line-clamp-2">
                          &ldquo;{note}&rdquo;
                        </p>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Batch note */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              Batch note (optional for approve, required for flag)
            </label>
            <Textarea
              rows={3}
              value={batchNote}
              onChange={(e) => setBatchNote(e.target.value)}
              placeholder="Note attached to every subsection in the bulk action…"
              className="min-h-20"
            />
          </div>
        </div>

        <SheetFooter className="border-t flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={bulkAction !== null}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleFlagProfile()}
            disabled={bulkAction !== null}
            className="text-amber-700 border-amber-300 hover:bg-amber-50 gap-1.5"
          >
            {bulkAction === "flag" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Flag className="size-3.5" />
            )}
            Flag profile
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleApproveAll()}
            disabled={bulkAction !== null}
            className="bg-brand-navy hover:bg-brand-blue gap-1.5"
          >
            {bulkAction === "approve" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="size-3.5" />
            )}
            Approve all
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
