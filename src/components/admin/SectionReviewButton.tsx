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
}

export function SectionReviewButton({
  applicationId,
  sectionKey,
  sectionLabel,
  currentStatus,
  onReviewSaved,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
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
