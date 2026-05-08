"use client";

import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionReviewPanel } from "./SectionReviewPanel";
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
}

export function SectionReviewButton({
  applicationId,
  sectionKey,
  sectionLabel,
  currentStatus,
  onReviewSaved,
  tone = "default",
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className={
          tone === "on-dark"
            ? "border-white/40 text-white hover:bg-white/10 hover:text-white bg-transparent"
            : undefined
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
      />
    </>
  );
}
