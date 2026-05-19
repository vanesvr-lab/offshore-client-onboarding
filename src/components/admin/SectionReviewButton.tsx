"use client";

import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionReviewPanel } from "./SectionReviewPanel";
import { useHasFlag } from "@/lib/admin-permissions-context";
import type { ApplicationSectionReview, SectionReviewStatus } from "@/types";

interface Props {
  applicationId: string;
  sectionKey: string;
  sectionLabel: string;
  currentStatus: SectionReviewStatus | null;
  onReviewSaved: (review: ApplicationSectionReview) => void;
  // B-079 — switches the trigger button to a translucent-white outline so
  // it reads as a band-level affordance on the navy step header.
  tone?: "default" | "on-dark";
  /** B-110 — forwarded to `SectionReviewPanel` to drive the Force-review
   *  override flow when admin marks an incomplete section reviewed. */
  sectionIncomplete?: boolean;
}

export function SectionReviewButton({
  applicationId,
  sectionKey,
  sectionLabel,
  currentStatus,
  onReviewSaved,
  tone = "default",
  sectionIncomplete,
}: Props) {
  const [open, setOpen] = useState(false);
  // B-127 — Mark Section Reviewed is gated on can_review. Renders the
  // button disabled with a tooltip when off; the underlying POST
  // /api/admin/applications/[id]/section-reviews returns 403 as a
  // belt-and-braces guard.
  const canReview = useHasFlag("can_review");
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={!canReview}
        title={canReview ? undefined : "Your role can't sign off on reviews."}
        className={
          tone === "on-dark"
            ? "border-white/40 text-white hover:bg-white/10 hover:text-white bg-transparent disabled:opacity-50"
            : // B-084 Batch 2 — brand-navy outline for the standard tone so
              // every Review button on /admin/services/[id] reads as the
              // same family as the rest of the page.
              "bg-white hover:bg-gray-50 text-brand-navy hover:text-brand-navy border-brand-navy rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
        }
      >
        <ClipboardCheck className="size-3.5" />
        Review
      </Button>
      <SectionReviewPanel
        applicationId={applicationId}
        sectionKey={sectionKey}
        sectionLabel={sectionLabel}
        currentStatus={currentStatus}
        open={open}
        onOpenChange={setOpen}
        onSaved={(r) => {
          onReviewSaved(r);
          setOpen(false);
        }}
        sectionIncomplete={sectionIncomplete}
      />
    </>
  );
}
